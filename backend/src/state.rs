use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD};
use base64::Engine as _;
use chrono::{SecondsFormat, Utc};
use rand::Rng;
use rusqlite::Connection;
use serde_json::{json, Value};

#[derive(Clone, Debug)]
pub struct ServerConfig {
	pub host: String,
	pub port: u16,
	pub cache_dir: PathBuf,
	pub static_dir: Option<PathBuf>,
}

impl Default for ServerConfig {
	fn default() -> Self {
		let cache_dir = std::env::var("DISTUDIO_CACHE_DIR")
			.map(PathBuf::from)
			.unwrap_or_else(|_| PathBuf::from(".gallery_cache"));

		let static_dir = std::env::var("DISTUDIO_STATIC_DIR")
			.ok()
			.filter(|s| !s.trim().is_empty())
			.map(PathBuf::from)
			.or_else(|| {
				let candidate = PathBuf::from("build");
				if candidate.join("index.html").is_file() {
					Some(candidate)
				} else {
					None
				}
			});

		let host = std::env::var("DISTUDIO_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
		let port = std::env::var("DISTUDIO_PORT")
			.ok()
			.and_then(|s| s.parse::<u16>().ok())
			.unwrap_or(3001);

		Self {
			host,
			port,
			cache_dir,
			static_dir,
		}
	}
}

#[derive(Clone)]
pub struct AppState {
	pub cache_dir: PathBuf,
	pub sessions_dir: PathBuf,
	pub assets_dir: PathBuf,
	pub frames_dir: PathBuf,
	pub stickers_dir: PathBuf,
	pub ar_dir: PathBuf,
	pub thumbnails_dir: PathBuf,
	pub static_dir: Option<PathBuf>,
	pub db: Arc<Mutex<Connection>>,
}

impl AppState {
	pub fn new(config: &ServerConfig, conn: Connection) -> std::io::Result<Self> {
		let cache_dir = config.cache_dir.clone();
		let sessions_dir = cache_dir.join("sessions");
		let assets_dir = cache_dir.join("custom-assets");
		let frames_dir = assets_dir.join("frames");
		let stickers_dir = assets_dir.join("stickers");
		let ar_dir = assets_dir.join("ar");
		let thumbnails_dir = assets_dir.join("thumbnails");

		let state = Self {
			cache_dir,
			sessions_dir,
			assets_dir,
			frames_dir,
			stickers_dir,
			ar_dir,
			thumbnails_dir,
			static_dir: config.static_dir.clone(),
			db: Arc::new(Mutex::new(conn)),
		};

		state.ensure_dirs()?;
		Ok(state)
	}

	pub fn ensure_dirs(&self) -> std::io::Result<()> {
		for dir in [
			&self.cache_dir,
			&self.sessions_dir,
			&self.assets_dir,
			&self.frames_dir,
			&self.stickers_dir,
			&self.ar_dir,
			&self.thumbnails_dir,
		] {
			if !dir.exists() {
				fs::create_dir_all(dir)?;
			}
		}
		Ok(())
	}

	pub fn conn(&self) -> Result<MutexGuard<'_, Connection>, (StatusCode, Json<Value>)> {
		self.db
			.lock()
			.map_err(|_| ok_err(StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned"))
	}
}

pub fn ok_err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<Value>) {
	(status, Json(json!({ "ok": false, "error": msg.into() })))
}

pub fn simple_err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<Value>) {
	(status, Json(json!({ "error": msg.into() })))
}

pub fn now_iso() -> String {
	Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn now_millis() -> i64 {
	Utc::now().timestamp_millis()
}

pub fn is_safe_id(id: &str) -> bool {
	let len = id.len();
	(1..=64).contains(&len)
		&& id
			.bytes()
			.all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

pub fn safe_filename(raw: &str) -> String {
	let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
	let mut cleaned = String::with_capacity(base.len());
	let mut prev_dash = false;
	for ch in base.chars() {
		if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
			cleaned.push(ch);
			prev_dash = false;
		} else if !prev_dash {
			cleaned.push('-');
			prev_dash = true;
		}
	}
	let trimmed = cleaned.trim_matches('-').to_string();
	if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
		format!("asset-{}", now_millis())
	} else {
		trimmed
	}
}

pub fn slugify_id(raw: &str) -> String {
	let mut out = String::with_capacity(raw.len());
	let mut prev_dash = false;
	for ch in raw.trim().to_ascii_lowercase().chars() {
		if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
			out.push(ch);
			prev_dash = false;
		} else if !prev_dash {
			out.push('-');
			prev_dash = true;
		}
	}
	out.trim_matches('-').to_string()
}

pub fn uid(prefix: &str, sep: &str) -> String {
	let ts = base36(now_millis().max(0) as u64);
	let mut rng = rand::thread_rng();
	let rnd: String = (0..5)
		.map(|_| {
			const ALPH: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
			ALPH[rng.gen_range(0..ALPH.len())] as char
		})
		.collect();
	format!("{prefix}{sep}{ts}{sep}{rnd}")
}

fn base36(mut num: u64) -> String {
	const ALPH: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
	if num == 0 {
		return "0".to_string();
	}
	let mut chars = Vec::new();
	while num > 0 {
		chars.push(ALPH[(num % 36) as usize] as char);
		num /= 36;
	}
	chars.iter().rev().collect()
}

pub fn resolve_safe_child(base: &Path, file_name: &str) -> Option<PathBuf> {
	if file_name.is_empty()
		|| file_name.contains('/')
		|| file_name.contains('\\')
		|| file_name.contains("..")
		|| file_name == "."
	{
		return None;
	}
	let candidate = base.join(file_name);
	if candidate.parent() == Some(base) {
		Some(candidate)
	} else {
		None
	}
}

pub fn decode_data_url(raw: &str) -> Option<(String, Vec<u8>)> {
	let trimmed = raw.trim();
	let rest = trimmed.strip_prefix("data:")?;
	let (header, body) = rest.split_once(',')?;
	let mime_part = header.split(';').next().unwrap_or("application/octet-stream").trim();
	let normalized_mime = if mime_part.eq_ignore_ascii_case("image/jpg") {
		"image/jpeg".to_string()
	} else if mime_part.is_empty() {
		"application/octet-stream".to_string()
	} else {
		mime_part.to_ascii_lowercase()
	};

	if header.to_ascii_lowercase().contains(";base64") {
		let compact: String = body.chars().filter(|c| !c.is_ascii_whitespace()).collect();
		let bytes = STANDARD
			.decode(&compact)
			.or_else(|_| STANDARD_NO_PAD.decode(&compact))
			.ok()?;
		if bytes.is_empty() {
			return None;
		}
		Some((normalized_mime, bytes))
	} else if normalized_mime == "image/svg+xml" {
		let decoded = percent_decode(body);
		if decoded.is_empty() {
			return None;
		}
		Some((normalized_mime, decoded))
	} else {
		None
	}
}

fn percent_decode(input: &str) -> Vec<u8> {
	let bytes = input.as_bytes();
	let mut out = Vec::with_capacity(bytes.len());
	let mut i = 0;
	while i < bytes.len() {
		if bytes[i] == b'%' && i + 2 < bytes.len() {
			if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
				out.push((hi << 4) | lo);
				i += 3;
				continue;
			}
		}
		out.push(bytes[i]);
		i += 1;
	}
	out
}

fn hex_val(b: u8) -> Option<u8> {
	match b {
		b'0'..=b'9' => Some(b - b'0'),
		b'a'..=b'f' => Some(b - b'a' + 10),
		b'A'..=b'F' => Some(b - b'A' + 10),
		_ => None,
	}
}

pub fn ext_for_mime(mime: &str) -> &'static str {
	let lower = mime.to_ascii_lowercase();
	if lower.contains("png") {
		"png"
	} else if lower.contains("jpeg") || lower.contains("jpg") {
		"jpg"
	} else if lower.contains("webp") {
		"webp"
	} else if lower.contains("gif") {
		"gif"
	} else if lower.contains("svg") {
		"svg"
	} else if lower.contains("mp4") {
		"mp4"
	} else if lower.contains("webm") {
		"webm"
	} else {
		"bin"
	}
}

pub fn mime_for_path(path: &Path) -> &'static str {
	match path
		.extension()
		.and_then(|e| e.to_str())
		.unwrap_or("")
		.to_ascii_lowercase()
		.as_str()
	{
		"png" => "image/png",
		"jpg" | "jpeg" => "image/jpeg",
		"webp" => "image/webp",
		"gif" => "image/gif",
		"svg" => "image/svg+xml",
		"mp4" => "video/mp4",
		"webm" => "video/webm",
		_ => "application/octet-stream",
	}
}

pub fn binary_response(bytes: Vec<u8>, mime: &str, cache_control: &str) -> Response {
	let mut res = bytes.into_response();
	let headers = res.headers_mut();
	if let Ok(ct) = HeaderValue::from_str(mime) {
		headers.insert(header::CONTENT_TYPE, ct);
	}
	if let Ok(cc) = HeaderValue::from_str(cache_control) {
		headers.insert(header::CACHE_CONTROL, cc);
	}
	res
}

pub fn url_encode_segment(raw: &str) -> String {
	let mut out = String::with_capacity(raw.len());
	for b in raw.as_bytes() {
		match b {
			b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
				out.push(*b as char);
			}
			_ => {
				out.push_str(&format!("%{:02X}", b));
			}
		}
	}
	out
}
