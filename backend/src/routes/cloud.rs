use std::collections::BTreeMap;
use std::fs;
use std::time::Duration;

use axum::extract::{Path as AxumPath, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::{DateTime, Utc};
use rand::RngCore;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::routes::queue::enqueue_row;
use crate::state::{
	is_safe_id, mime_for_path, now_iso, ok_err, resolve_safe_child, url_encode_segment, AppState,
};

const OAUTH_COOKIE_NAME: &str = "distudio_oauth_state";
const GOOGLE_AUTH_BASE: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_SCOPES: &str =
	"https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";

#[derive(Clone, Debug)]
pub struct GoogleEndpoints {
	pub token_url: String,
	pub userinfo_url: String,
	pub drive_files_url: String,
	pub drive_upload_url: String,
}

impl Default for GoogleEndpoints {
	fn default() -> Self {
		Self {
			token_url: "https://oauth2.googleapis.com/token".to_string(),
			userinfo_url: "https://www.googleapis.com/oauth2/v2/userinfo".to_string(),
			drive_files_url: "https://www.googleapis.com/drive/v3/files".to_string(),
			drive_upload_url: "https://www.googleapis.com/upload/drive/v3/files".to_string(),
		}
	}
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CloudUploadTypes {
	pub strip: bool,
	pub photos: bool,
	pub gif: bool,
	pub video: bool,
}

#[derive(Clone, Debug)]
struct CloudConfigRow {
	client_id: String,
	client_secret: String,
	access_token: String,
	refresh_token: String,
	token_expires_at: String,
	email: String,
	needs_reconnect: bool,
	root_folder_id: String,
	root_folder_name: String,
	auto_sync: bool,
	upload_strip: bool,
	upload_photos: bool,
	upload_gif: bool,
	upload_video: bool,
	public_share: bool,
	qr_mode: String,
	public_base_url: String,
	last_sync_at: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PublicCloudStatus {
	pub ok: bool,
	pub configured: bool,
	pub client_id: String,
	pub has_client_id: bool,
	pub has_client_secret: bool,
	pub using_env_credentials: bool,
	pub connected: bool,
	pub needs_reconnect: bool,
	pub email: Option<String>,
	pub root_folder_id: Option<String>,
	pub root_folder_name: String,
	pub auto_sync: bool,
	pub public_share: bool,
	pub qr_mode: String,
	pub public_base_url: Option<String>,
	pub upload_types: CloudUploadTypes,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub last_sync_at: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
	pub ok: bool,
	pub session_id: String,
	pub status: String,
	pub uploaded_count: usize,
	pub skipped_count: usize,
	pub is_public: bool,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub drive_folder_url: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub error: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionCloudSyncResponse {
	pub ok: bool,
	pub session_id: String,
	pub qr_mode: String,
	pub public_base_url: Option<String>,
	pub cloud_eligible: bool,
	pub status: String,
	pub is_public: bool,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub drive_folder_url: Option<String>,
	pub uploaded_count: usize,
	pub total_files: usize,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub error: Option<String>,
}

pub fn build_google_auth_url(client_id: &str, redirect_uri: &str, state: &str) -> String {
	format!(
		"{GOOGLE_AUTH_BASE}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
		url_encode_segment(client_id),
		url_encode_segment(redirect_uri),
		url_encode_segment(OAUTH_SCOPES),
		url_encode_segment(state),
	)
}

fn normalize_qr_mode(raw: &str) -> String {
	let lower = raw.trim().to_ascii_lowercase();
	match lower.as_str() {
		"local" => "local".to_string(),
		"gallery" => "gallery".to_string(),
		_ => "smart".to_string(),
	}
}

fn sanitize_public_base_url(raw: &str) -> String {
	let trimmed = raw.trim().trim_end_matches('/');
	if trimmed.is_empty() {
		return String::new();
	}
	let lower = trimmed.to_ascii_lowercase();
	let rest = if let Some(r) = lower.strip_prefix("https://") {
		r
	} else if let Some(r) = lower.strip_prefix("http://") {
		r
	} else {
		return String::new();
	};
	if rest.is_empty() || rest.chars().any(char::is_whitespace) {
		return String::new();
	}
	trimmed.chars().take(240).collect()
}

pub fn cloud_qr_meta(conn: &Connection) -> (String, bool) {
	let row = load_cloud_row(conn);
	(normalize_qr_mode(&row.qr_mode), row_is_qr_eligible(&row))
}

fn row_is_qr_eligible(row: &CloudConfigRow) -> bool {
	let connected = !row.refresh_token.trim().is_empty() || !row.access_token.trim().is_empty();
	normalize_qr_mode(&row.qr_mode) == "smart"
		&& row.auto_sync
		&& row.public_share
		&& connected
		&& !row.needs_reconnect
}

fn load_cloud_row(conn: &Connection) -> CloudConfigRow {
	conn.query_row(
		"
		SELECT client_id, client_secret, access_token, refresh_token, token_expires_at,
			   email, needs_reconnect, root_folder_id, root_folder_name, auto_sync,
			   upload_strip, upload_photos, upload_gif, upload_video,
			   public_share, qr_mode, public_base_url, last_sync_at
		FROM cloud_config WHERE id = 1
		",
		[],
		|r| {
			let qr_raw: String = r.get(15)?;
			let pub_url_raw: String = r.get(16)?;
			Ok(CloudConfigRow {
				client_id: r.get(0)?,
				client_secret: r.get(1)?,
				access_token: r.get(2)?,
				refresh_token: r.get(3)?,
				token_expires_at: r.get(4)?,
				email: r.get(5)?,
				needs_reconnect: r.get::<_, i64>(6)? != 0,
				root_folder_id: r.get(7)?,
				root_folder_name: r.get(8)?,
				auto_sync: r.get::<_, i64>(9)? != 0,
				upload_strip: r.get::<_, i64>(10)? != 0,
				upload_photos: r.get::<_, i64>(11)? != 0,
				upload_gif: r.get::<_, i64>(12)? != 0,
				upload_video: r.get::<_, i64>(13)? != 0,
				public_share: r.get::<_, i64>(14)? != 0,
				qr_mode: normalize_qr_mode(&qr_raw),
				public_base_url: sanitize_public_base_url(&pub_url_raw),
				last_sync_at: r.get(17)?,
			})
		},
	)
	.unwrap_or(CloudConfigRow {
		client_id: String::new(),
		client_secret: String::new(),
		access_token: String::new(),
		refresh_token: String::new(),
		token_expires_at: String::new(),
		email: String::new(),
		needs_reconnect: false,
		root_folder_id: String::new(),
		root_folder_name: "DISTUDIO Photobooth".to_string(),
		auto_sync: true,
		upload_strip: true,
		upload_photos: true,
		upload_gif: true,
		upload_video: true,
		public_share: true,
		qr_mode: "smart".to_string(),
		public_base_url: String::new(),
		last_sync_at: String::new(),
	})
}

fn effective_credentials(row: &CloudConfigRow) -> (String, String, bool) {
	let db_cid = row.client_id.trim();
	let db_sec = row.client_secret.trim();
	if !db_cid.is_empty() || !db_sec.is_empty() {
		return (db_cid.to_string(), db_sec.to_string(), false);
	}
	let env_cid = std::env::var("GOOGLE_CLIENT_ID")
		.unwrap_or_default()
		.trim()
		.to_string();
	let env_sec = std::env::var("GOOGLE_CLIENT_SECRET")
		.unwrap_or_default()
		.trim()
		.to_string();
	let using_env = !env_cid.is_empty() && !env_sec.is_empty();
	(env_cid, env_sec, using_env)
}

fn build_public_status(row: &CloudConfigRow) -> PublicCloudStatus {
	let (cid, sec, using_env) = effective_credentials(row);
	let has_cid = !cid.is_empty();
	let has_sec = !sec.is_empty();
	let connected = !row.refresh_token.trim().is_empty() || !row.access_token.trim().is_empty();

	PublicCloudStatus {
		ok: true,
		configured: has_cid && has_sec,
		client_id: cid,
		has_client_id: has_cid,
		has_client_secret: has_sec,
		using_env_credentials: using_env,
		connected,
		needs_reconnect: row.needs_reconnect,
		email: (!row.email.trim().is_empty()).then(|| row.email.clone()),
		root_folder_id: (!row.root_folder_id.trim().is_empty()).then(|| row.root_folder_id.clone()),
		root_folder_name: if row.root_folder_name.trim().is_empty() {
			"DISTUDIO Photobooth".to_string()
		} else {
			row.root_folder_name.clone()
		},
		auto_sync: row.auto_sync,
		public_share: row.public_share,
		qr_mode: normalize_qr_mode(&row.qr_mode),
		public_base_url: (!row.public_base_url.trim().is_empty())
			.then(|| row.public_base_url.clone()),
		upload_types: CloudUploadTypes {
			strip: row.upload_strip,
			photos: row.upload_photos,
			gif: row.upload_gif,
			video: row.upload_video,
		},
		last_sync_at: (!row.last_sync_at.trim().is_empty()).then(|| row.last_sync_at.clone()),
	}
}

// ─── HTTP Handlers: Status / Config / Disconnect ────────────────────────────

pub async fn get_google_status(
	State(state): State<AppState>,
) -> Result<Json<PublicCloudStatus>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	let row = load_cloud_row(&conn);
	Ok(Json(build_public_status(&row)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudUploadTypesPatch {
	pub strip: Option<bool>,
	pub photos: Option<bool>,
	pub gif: Option<bool>,
	pub video: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudConfigPatch {
	pub client_id: Option<String>,
	pub client_secret: Option<String>,
	pub root_folder_id: Option<Value>,
	pub root_folder_name: Option<String>,
	pub auto_sync: Option<bool>,
	pub public_share: Option<bool>,
	pub qr_mode: Option<String>,
	pub public_base_url: Option<String>,
	pub upload_types: Option<CloudUploadTypesPatch>,
}

pub async fn put_google_config(
	State(state): State<AppState>,
	Json(patch): Json<CloudConfigPatch>,
) -> Result<Json<PublicCloudStatus>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	let prev = load_cloud_row(&conn);

	let client_id = patch
		.client_id
		.map(|s| s.trim().chars().take(240).collect())
		.unwrap_or(prev.client_id);
	let client_secret = match patch.client_secret {
		Some(s) if !s.trim().is_empty() => s.trim().chars().take(240).collect(),
		_ => prev.client_secret,
	};
	let root_folder_name = patch
		.root_folder_name
		.map(|s| {
			let t: String = s.trim().chars().take(120).collect();
			if t.is_empty() {
				"DISTUDIO Photobooth".to_string()
			} else {
				t
			}
		})
		.unwrap_or(prev.root_folder_name.clone());

	let root_folder_id = match patch.root_folder_id {
		Some(Value::Null) => String::new(),
		Some(Value::String(s)) => s.trim().chars().take(160).collect(),
		_ => {
			// If folder name changed explicitly without passing rootFolderId, reset cached folder id
			if root_folder_name != prev.root_folder_name {
				String::new()
			} else {
				prev.root_folder_id
			}
		}
	};

	let auto_sync = patch.auto_sync.unwrap_or(prev.auto_sync);
	let public_share = patch.public_share.unwrap_or(prev.public_share);
	let qr_mode = patch
		.qr_mode
		.as_deref()
		.map(normalize_qr_mode)
		.unwrap_or(prev.qr_mode);
	let public_base_url = patch
		.public_base_url
		.as_deref()
		.map(sanitize_public_base_url)
		.unwrap_or(prev.public_base_url);
	let upload_strip = patch
		.upload_types
		.as_ref()
		.and_then(|u| u.strip)
		.unwrap_or(prev.upload_strip);
	let upload_photos = patch
		.upload_types
		.as_ref()
		.and_then(|u| u.photos)
		.unwrap_or(prev.upload_photos);
	let upload_gif = patch
		.upload_types
		.as_ref()
		.and_then(|u| u.gif)
		.unwrap_or(prev.upload_gif);
	let upload_video = patch
		.upload_types
		.as_ref()
		.and_then(|u| u.video)
		.unwrap_or(prev.upload_video);
	let updated_at = now_iso();

	conn.execute(
		"
		UPDATE cloud_config SET
			client_id = ?1,
			client_secret = ?2,
			root_folder_id = ?3,
			root_folder_name = ?4,
			auto_sync = ?5,
			upload_strip = ?6,
			upload_photos = ?7,
			upload_gif = ?8,
			upload_video = ?9,
			public_share = ?10,
			qr_mode = ?11,
			public_base_url = ?12,
			updated_at = ?13
		WHERE id = 1
		",
		params![
			client_id,
			client_secret,
			root_folder_id,
			root_folder_name,
			if auto_sync { 1 } else { 0 },
			if upload_strip { 1 } else { 0 },
			if upload_photos { 1 } else { 0 },
			if upload_gif { 1 } else { 0 },
			if upload_video { 1 } else { 0 },
			if public_share { 1 } else { 0 },
			qr_mode,
			public_base_url,
			updated_at,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let next = load_cloud_row(&conn);
	Ok(Json(build_public_status(&next)))
}

pub async fn post_google_disconnect(
	State(state): State<AppState>,
) -> Result<Json<PublicCloudStatus>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	let now = now_iso();
	conn.execute(
		"
		UPDATE cloud_config SET
			access_token = '',
			refresh_token = '',
			token_expires_at = '',
			email = '',
			needs_reconnect = 0,
			root_folder_id = '',
			updated_at = ?1
		WHERE id = 1
		",
		params![now],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let next = load_cloud_row(&conn);
	Ok(Json(build_public_status(&next)))
}

// ─── HTTP Handlers: OAuth 2.0 Auth & Callback ───────────────────────────────

pub async fn get_google_auth(State(state): State<AppState>, headers: HeaderMap) -> Response {
	let (client_id, client_secret) = {
		let Ok(conn) = state.conn() else {
			return ok_err(StatusCode::INTERNAL_SERVER_ERROR, "DB error").into_response();
		};
		let row = load_cloud_row(&conn);
		let (cid, sec, _) = effective_credentials(&row);
		(cid, sec)
	};

	if client_id.is_empty() || client_secret.is_empty() {
		return ok_err(
			StatusCode::BAD_REQUEST,
			"Client ID dan Client Secret Google Drive belum dikonfigurasi.",
		)
		.into_response();
	}

	let redirect_uri = resolve_redirect_uri(&headers);
	let nonce = random_hex(24);
	let expires_at = Utc::now().timestamp() + 600;

	if let Ok(conn) = state.conn() {
		let _ = conn.execute(
			"DELETE FROM oauth_states WHERE expires_at < ?1",
			params![Utc::now().timestamp()],
		);
		let _ = conn.execute(
			"INSERT INTO oauth_states (state, redirect_uri, expires_at) VALUES (?1, ?2, ?3)",
			params![nonce, redirect_uri, expires_at],
		);
	}

	let auth_url = build_google_auth_url(&client_id, &redirect_uri, &nonce);
	let mut res = StatusCode::FOUND.into_response();
	if let Ok(loc) = HeaderValue::from_str(&auth_url) {
		res.headers_mut().insert(header::LOCATION, loc);
	}
	let cookie_val =
		format!("{OAUTH_COOKIE_NAME}={nonce}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600");
	if let Ok(ck) = HeaderValue::from_str(&cookie_val) {
		res.headers_mut().insert(header::SET_COOKIE, ck);
	}
	res
}

#[derive(Deserialize)]
pub struct OAuthCallbackQuery {
	pub code: Option<String>,
	pub state: Option<String>,
	pub error: Option<String>,
}

pub async fn get_google_callback(
	State(state): State<AppState>,
	headers: HeaderMap,
	Query(q): Query<OAuthCallbackQuery>,
) -> Response {
	if let Some(google_err) = q.error.as_deref().filter(|s| !s.is_empty()) {
		return redirect_with_cleared_cookie(&format!(
			"/dashboard/settings?cloud=error&reason={}",
			url_encode_segment(google_err)
		));
	}

	let Some(query_state) = q.state.as_deref().filter(|s| !s.is_empty()) else {
		return ok_err(StatusCode::BAD_REQUEST, "Parameter state OAuth tidak ada.").into_response();
	};
	let Some(cookie_state) = extract_cookie(&headers, OAUTH_COOKIE_NAME) else {
		return ok_err(StatusCode::BAD_REQUEST, "Cookie state OAuth tidak ditemukan.").into_response();
	};

	if !constant_time_eq(query_state.as_bytes(), cookie_state.as_bytes()) {
		return ok_err(StatusCode::BAD_REQUEST, "State OAuth tidak cocok (CSRF ditolak).")
			.into_response();
	}

	let stored_redirect: Option<(String, i64)> = {
		let Ok(conn) = state.conn() else {
			return ok_err(StatusCode::INTERNAL_SERVER_ERROR, "DB error").into_response();
		};
		let row = conn
			.query_row(
				"SELECT redirect_uri, expires_at FROM oauth_states WHERE state = ?1",
				params![query_state],
				|r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
			)
			.ok();
		let _ = conn.execute("DELETE FROM oauth_states WHERE state = ?1", params![query_state]);
		row
	};

	let Some((redirect_uri, expires_at)) = stored_redirect else {
		return ok_err(StatusCode::BAD_REQUEST, "State OAuth tidak valid atau sudah dipakai.")
			.into_response();
	};
	if expires_at < Utc::now().timestamp() {
		return ok_err(StatusCode::BAD_REQUEST, "Sesi OAuth sudah kedaluwarsa, ulangi koneksi.")
			.into_response();
	}

	let Some(code) = q.code.as_deref().filter(|s| !s.is_empty()) else {
		return ok_err(StatusCode::BAD_REQUEST, "Kode otorisasi Google tidak ditemukan.")
			.into_response();
	};

	let endpoints = GoogleEndpoints::default();
	match exchange_code_and_save(&state, code, &redirect_uri, &endpoints).await {
		Ok(_) => redirect_with_cleared_cookie("/dashboard/settings?cloud=connected"),
		Err(err) => redirect_with_cleared_cookie(&format!(
			"/dashboard/settings?cloud=error&reason={}",
			url_encode_segment(&err)
		)),
	}
}

async fn exchange_code_and_save(
	state: &AppState,
	code: &str,
	redirect_uri: &str,
	endpoints: &GoogleEndpoints,
) -> Result<(), String> {
	let (client_id, client_secret, root_folder_name) = {
		let conn = state.conn().map_err(|_| "DB error".to_string())?;
		let row = load_cloud_row(&conn);
		let (cid, sec, _) = effective_credentials(&row);
		(cid, sec, row.root_folder_name)
	};

	let client = http_client()?;
	let res = client
		.post(&endpoints.token_url)
		.form(&[
			("code", code),
			("client_id", client_id.as_str()),
			("client_secret", client_secret.as_str()),
			("redirect_uri", redirect_uri),
			("grant_type", "authorization_code"),
		])
		.send()
		.await
		.map_err(|e| format!("Gagal menghubungi server OAuth Google: {e}"))?;

	let status = res.status();
	let body: Value = res
		.json()
		.await
		.map_err(|e| format!("Respons token Google tidak valid: {e}"))?;
	if !status.is_success() {
		let err_msg = body["error_description"]
			.as_str()
			.or_else(|| body["error"].as_str())
			.unwrap_or("Penukaran kode OAuth ditolak Google.");
		return Err(err_msg.to_string());
	}

	let access_token = body["access_token"]
		.as_str()
		.ok_or_else(|| "Google tidak mengembalikan access_token.".to_string())?
		.to_string();
	let refresh_token = body["refresh_token"].as_str().map(str::to_string);
	let expires_in = body["expires_in"].as_i64().unwrap_or(3600);
	let expires_at = (Utc::now() + chrono::Duration::seconds(expires_in))
		.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

	// Fetch connected Gmail address (best-effort)
	let email = match client
		.get(&endpoints.userinfo_url)
		.bearer_auth(&access_token)
		.send()
		.await
	{
		Ok(r) if r.status().is_success() => r
			.json::<Value>()
			.await
			.ok()
			.and_then(|v| v["email"].as_str().map(str::to_string)),
		_ => None,
	};

	// Ensure default root folder exists on Drive (best-effort)
	let folder_name = if root_folder_name.trim().is_empty() {
		"DISTUDIO Photobooth".to_string()
	} else {
		root_folder_name
	};
	let root_folder_id = ensure_drive_folder(&client, endpoints, &access_token, &folder_name, None)
		.await
		.ok()
		.map(|(id, _)| id);

	let conn = state.conn().map_err(|_| "DB error".to_string())?;
	let prev = load_cloud_row(&conn);
	let final_refresh = refresh_token.unwrap_or(prev.refresh_token);
	let final_email = email.unwrap_or(prev.email);
	let final_root_id = root_folder_id.unwrap_or(prev.root_folder_id);
	let now = now_iso();

	conn.execute(
		"
		UPDATE cloud_config SET
			access_token = ?1,
			refresh_token = ?2,
			token_expires_at = ?3,
			email = ?4,
			needs_reconnect = 0,
			root_folder_id = ?5,
			updated_at = ?6
		WHERE id = 1
		",
		params![
			access_token,
			final_refresh,
			expires_at,
			final_email,
			final_root_id,
			now,
		],
	)
	.map_err(|e| format!("Gagal menyimpan token Google Drive: {e}"))?;

	Ok(())
}

// ─── Token Refresh ──────────────────────────────────────────────────────────

pub async fn get_valid_access_token(state: &AppState) -> Result<String, String> {
	get_valid_access_token_with_endpoints(state, &GoogleEndpoints::default()).await
}

pub async fn get_valid_access_token_with_endpoints(
	state: &AppState,
	endpoints: &GoogleEndpoints,
) -> Result<String, String> {
	let row = {
		let conn = state.conn().map_err(|_| "DB error".to_string())?;
		load_cloud_row(&conn)
	};

	if !row.access_token.is_empty() && !token_needs_refresh(&row.token_expires_at) {
		return Ok(row.access_token);
	}

	if row.refresh_token.trim().is_empty() {
		mark_needs_reconnect(state, true);
		return Err("Token Google Drive kedaluwarsa — hubungkan ulang di Pengaturan.".to_string());
	}

	let (client_id, client_secret, _) = effective_credentials(&row);
	if client_id.is_empty() || client_secret.is_empty() {
		return Err("Kredensial OAuth Google Drive belum dikonfigurasi.".to_string());
	}

	let client = http_client()?;
	let res = client
		.post(&endpoints.token_url)
		.form(&[
			("client_id", client_id.as_str()),
			("client_secret", client_secret.as_str()),
			("refresh_token", row.refresh_token.as_str()),
			("grant_type", "refresh_token"),
		])
		.send()
		.await
		.map_err(|e| format!("Gagal memperbarui token Google Drive: {e}"))?;

	let status = res.status();
	let body: Value = res.json().await.unwrap_or(Value::Null);

	if !status.is_success() {
		let err_code = body["error"].as_str().unwrap_or("");
		if status == StatusCode::UNAUTHORIZED || err_code == "invalid_grant" {
			mark_needs_reconnect(state, true);
			return Err(
				"Token Google Drive kedaluwarsa — hubungkan ulang di Pengaturan.".to_string(),
			);
		}
		let desc = body["error_description"]
			.as_str()
			.or(Some(err_code))
			.filter(|s| !s.is_empty())
			.unwrap_or("Refresh token gagal.");
		return Err(format!("Gagal refresh token Google Drive: {desc}"));
	}

	let new_access = body["access_token"]
		.as_str()
		.ok_or_else(|| "Respons refresh tidak berisi access_token.".to_string())?
		.to_string();
	let expires_in = body["expires_in"].as_i64().unwrap_or(3600);
	let expires_at = (Utc::now() + chrono::Duration::seconds(expires_in))
		.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

	if let Ok(conn) = state.conn() {
		let _ = conn.execute(
			"UPDATE cloud_config SET access_token = ?1, token_expires_at = ?2, needs_reconnect = 0, updated_at = ?3 WHERE id = 1",
			params![new_access, expires_at, now_iso()],
		);
	}

	Ok(new_access)
}

fn token_needs_refresh(expires_at_iso: &str) -> bool {
	if expires_at_iso.trim().is_empty() {
		return true;
	}
	let Ok(parsed) = DateTime::parse_from_rfc3339(expires_at_iso) else {
		return true;
	};
	parsed.with_timezone(&Utc) <= Utc::now() + chrono::Duration::seconds(120)
}

fn mark_needs_reconnect(state: &AppState, flag: bool) {
	if let Ok(conn) = state.conn() {
		let _ = conn.execute(
			"UPDATE cloud_config SET needs_reconnect = ?1, updated_at = ?2 WHERE id = 1",
			params![if flag { 1 } else { 0 }, now_iso()],
		);
	}
}

// ─── Drive API v3 Folders & Multipart Upload ────────────────────────────────

pub async fn get_google_folders(
	State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let token = get_valid_access_token(&state)
		.await
		.map_err(|e| ok_err(StatusCode::UNAUTHORIZED, e))?;
	let client = http_client().map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e))?;
	let endpoints = GoogleEndpoints::default();

	let q = "mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents";
	let url = format!(
		"{}?q={}&fields=files(id,name,webViewLink)&orderBy=name&pageSize=50",
		endpoints.drive_files_url,
		url_encode_segment(q)
	);
	let res = client
		.get(&url)
		.bearer_auth(&token)
		.send()
		.await
		.map_err(|e| ok_err(StatusCode::BAD_GATEWAY, format!("Gagal membaca folder Drive: {e}")))?;

	let body: Value = res.json().await.unwrap_or_else(|_| json!({ "files": [] }));
	let folders = body["files"].as_array().cloned().unwrap_or_default();
	Ok(Json(json!({ "ok": true, "folders": folders })))
}

#[derive(Deserialize)]
pub struct CreateFolderBody {
	pub name: Option<String>,
}

pub async fn post_google_folder(
	State(state): State<AppState>,
	Json(body): Json<CreateFolderBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let name = body.name.as_deref().map(str::trim).unwrap_or("");
	if name.is_empty() {
		return Err(ok_err(StatusCode::BAD_REQUEST, "Nama folder diperlukan."));
	}
	let token = get_valid_access_token(&state)
		.await
		.map_err(|e| ok_err(StatusCode::UNAUTHORIZED, e))?;
	let client = http_client().map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e))?;
	let endpoints = GoogleEndpoints::default();

	let (id, link) = ensure_drive_folder(&client, &endpoints, &token, name, None)
		.await
		.map_err(|e| ok_err(StatusCode::BAD_GATEWAY, e))?;

	Ok(Json(json!({
		"ok": true,
		"folder": { "id": id, "name": name, "webViewLink": link }
	})))
}

async fn ensure_drive_folder(
	client: &reqwest::Client,
	endpoints: &GoogleEndpoints,
	access_token: &str,
	name: &str,
	parent_id: Option<&str>,
) -> Result<(String, String), String> {
	let escaped = name.replace('\\', "\\\\").replace('\'', "\\'");
	let q = match parent_id {
		Some(pid) => format!(
			"mimeType='application/vnd.google-apps.folder' and name='{escaped}' and '{pid}' in parents and trashed=false"
		),
		None => format!(
			"mimeType='application/vnd.google-apps.folder' and name='{escaped}' and 'root' in parents and trashed=false"
		),
	};

	let search_url = format!(
		"{}?q={}&fields=files(id,name,webViewLink)&pageSize=1",
		endpoints.drive_files_url,
		url_encode_segment(&q)
	);
	let res = client
		.get(&search_url)
		.bearer_auth(access_token)
		.send()
		.await
		.map_err(|e| format!("Gagal mencari folder Drive '{name}': {e}"))?;

	if res.status().is_success() {
		let val: Value = res.json().await.unwrap_or(Value::Null);
		if let Some(first) = val["files"].as_array().and_then(|arr| arr.first()) {
			if let Some(id) = first["id"].as_str() {
				let link = first["webViewLink"]
					.as_str()
					.map(str::to_string)
					.unwrap_or_else(|| format!("https://drive.google.com/drive/folders/{id}"));
				return Ok((id.to_string(), link));
			}
		}
	}

	let mut meta = json!({
		"name": name,
		"mimeType": "application/vnd.google-apps.folder"
	});
	if let Some(pid) = parent_id {
		meta["parents"] = json!([pid]);
	}

	let create_url = format!("{}?fields=id,webViewLink", endpoints.drive_files_url);
	let created = client
		.post(&create_url)
		.bearer_auth(access_token)
		.json(&meta)
		.send()
		.await
		.map_err(|e| format!("Gagal membuat folder Drive '{name}': {e}"))?;

	if !created.status().is_success() {
		let txt = created.text().await.unwrap_or_default();
		return Err(format!("Google Drive menolak pembuatan folder '{name}': {txt}"));
	}

	let val: Value = created
		.json()
		.await
		.map_err(|e| format!("Respons folder Drive tidak valid: {e}"))?;
	let id = val["id"]
		.as_str()
		.ok_or_else(|| "Folder Drive tidak mengembalikan ID.".to_string())?
		.to_string();
	let link = val["webViewLink"]
		.as_str()
		.map(str::to_string)
		.unwrap_or_else(|| format!("https://drive.google.com/drive/folders/{id}"));
	Ok((id, link))
}

async fn upload_file_multipart(
	client: &reqwest::Client,
	endpoints: &GoogleEndpoints,
	access_token: &str,
	parent_id: &str,
	file_name: &str,
	mime_type: &str,
	data: &[u8],
) -> Result<(String, String), String> {
	let boundary = format!("distudio_boundary_{}", random_hex(8));
	let metadata = json!({
		"name": file_name,
		"parents": [parent_id]
	})
	.to_string();

	let mut body = Vec::with_capacity(metadata.len() + data.len() + 256);
	body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
	body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
	body.extend_from_slice(metadata.as_bytes());
	body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
	body.extend_from_slice(format!("Content-Type: {mime_type}\r\n\r\n").as_bytes());
	body.extend_from_slice(data);
	body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

	let upload_url = format!(
		"{}?uploadType=multipart&fields=id,webViewLink",
		endpoints.drive_upload_url
	);
	let res = client
		.post(&upload_url)
		.bearer_auth(access_token)
		.header(
			header::CONTENT_TYPE,
			format!("multipart/related; boundary={boundary}"),
		)
		.body(body)
		.send()
		.await
		.map_err(|e| format!("Gagal mengunggah {file_name}: {e}"))?;

	if !res.status().is_success() {
		let code = res.status();
		let txt = res.text().await.unwrap_or_default();
		return Err(format!("Unggah {file_name} gagal (HTTP {code}): {txt}"));
	}

	let val: Value = res
		.json()
		.await
		.map_err(|e| format!("Respons unggah {file_name} tidak valid: {e}"))?;
	let id = val["id"]
		.as_str()
		.ok_or_else(|| format!("Unggah {file_name} tidak mengembalikan ID."))?
		.to_string();
	let link = val["webViewLink"]
		.as_str()
		.map(str::to_string)
		.unwrap_or_else(|| format!("https://drive.google.com/file/d/{id}/view"));
	Ok((id, link))
}

async fn ensure_folder_public_read(
	client: &reqwest::Client,
	endpoints: &GoogleEndpoints,
	access_token: &str,
	folder_id: &str,
) -> Result<(), String> {
	let url = format!(
		"{}/{}/permissions?fields=id",
		endpoints.drive_files_url,
		url_encode_segment(folder_id)
	);
	let res = client
		.post(&url)
		.bearer_auth(access_token)
		.json(&json!({
			"role": "reader",
			"type": "anyone"
		}))
		.send()
		.await
		.map_err(|e| format!("Gagal mengatur izin publik folder Drive: {e}"))?;

	if !res.status().is_success() {
		let code = res.status();
		let txt = res.text().await.unwrap_or_default();
		return Err(format!(
			"Google Drive menolak izin publik folder (HTTP {code}): {txt}"
		));
	}
	Ok(())
}

// ─── Idempotent Session Sync Worker & Route ─────────────────────────────────

pub async fn get_session_cloud_sync(
	State(state): State<AppState>,
	AxumPath(session_id): AxumPath<String>,
) -> Result<Json<SessionCloudSyncResponse>, (StatusCode, Json<Value>)> {
	if !is_safe_id(&session_id) {
		return Err(ok_err(StatusCode::BAD_REQUEST, "ID sesi tidak valid."));
	}

	let conn = state.conn()?;
	let cfg = load_cloud_row(&conn);
	let qr_mode = normalize_qr_mode(&cfg.qr_mode);
	let public_base_url = (!cfg.public_base_url.trim().is_empty()).then(|| cfg.public_base_url.clone());
	let cloud_eligible = row_is_qr_eligible(&cfg);
	let auto_sync_active = {
		let connected = !cfg.refresh_token.trim().is_empty() || !cfg.access_token.trim().is_empty();
		cfg.auto_sync && connected && !cfg.needs_reconnect
	};

	let row: Option<(String, String, bool, i64, String, String)> = conn
		.query_row(
			"
			SELECT status, drive_folder_url, is_public, total_files, uploaded_files_json, last_error
			FROM cloud_session_sync
			WHERE session_id = ?1
			",
			params![session_id],
			|r| {
				Ok((
					r.get(0)?,
					r.get(1)?,
					r.get::<_, i64>(2)? != 0,
					r.get(3)?,
					r.get(4)?,
					r.get(5)?,
				))
			},
		)
		.ok();

	let (status, drive_folder_url, is_public, uploaded_count, total_files, error) = match row {
		Some((st, url, pub_flag, db_total, uploaded_json, last_err)) => {
			let map: BTreeMap<String, String> =
				serde_json::from_str(&uploaded_json).unwrap_or_default();
			let uploaded = map.len();
			let total = (db_total.max(0) as usize).max(uploaded);
			(
				st,
				(!url.trim().is_empty()).then_some(url),
				pub_flag,
				uploaded,
				total,
				(!last_err.trim().is_empty()).then_some(last_err),
			)
		}
		None => (
			if auto_sync_active {
				"pending".to_string()
			} else {
				"disabled".to_string()
			},
			None,
			false,
			0,
			0,
			None,
		),
	};

	Ok(Json(SessionCloudSyncResponse {
		ok: true,
		session_id,
		qr_mode,
		public_base_url,
		cloud_eligible,
		status,
		is_public,
		drive_folder_url,
		uploaded_count,
		total_files,
		error,
	}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRequestBody {
	pub session_id: Option<String>,
	pub all_pending: Option<bool>,
}

pub async fn post_cloud_sync(
	State(state): State<AppState>,
	Json(body): Json<SyncRequestBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let target_ids: Vec<String> = if let Some(sid) =
		body.session_id.as_deref().map(str::trim).filter(|s| !s.is_empty())
	{
		vec![sid.to_string()]
	} else {
		let conn = state.conn()?;
		let cfg = load_cloud_row(&conn);
		let want_public: i64 = if cfg.public_share { 1 } else { 0 };
		let mut stmt = conn
			.prepare(
				"
				SELECT gs.id
				FROM gallery_sessions gs
				LEFT JOIN cloud_session_sync cs ON cs.session_id = gs.id
				WHERE cs.status IS NULL
				   OR cs.status != 'done'
				   OR (?1 = 1 AND cs.is_public = 0)
				ORDER BY gs.created_at DESC
				LIMIT 50
				",
			)
			.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
		let ids: Vec<String> = stmt
			.query_map(params![want_public], |r| r.get::<_, String>(0))
			.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
			.filter_map(Result::ok)
			.collect();
		ids
	};

	let mut results = Vec::with_capacity(target_ids.len());
	for sid in target_ids {
		results.push(sync_session_to_drive(&state, &sid).await);
	}

	Ok(Json(json!({ "ok": true, "results": results })))
}

pub fn trigger_auto_sync_async(state: AppState, session_id: String) {
	let should_run = {
		let Ok(conn) = state.conn() else {
			return;
		};
		let row = load_cloud_row(&conn);
		let connected = !row.refresh_token.trim().is_empty() || !row.access_token.trim().is_empty();
		row.auto_sync && connected && !row.needs_reconnect
	};

	if should_run {
		tokio::spawn(async move {
			let _ = sync_session_to_drive(&state, &session_id).await;
		});
	}
}

pub async fn sync_session_to_drive(state: &AppState, session_id: &str) -> SyncResult {
	sync_session_with_endpoints(state, session_id, &GoogleEndpoints::default()).await
}

pub async fn sync_session_with_endpoints(
	state: &AppState,
	session_id: &str,
	endpoints: &GoogleEndpoints,
) -> SyncResult {
	let (cfg, session_info, prev_sync) = {
		let Ok(conn) = state.conn() else {
			return fail_result(session_id, 0, 0, "Gagal mengunci database lokal.");
		};
		let cfg = load_cloud_row(&conn);
		let sess: Option<(String, Option<String>, Option<String>, Option<String>)> = conn
			.query_row(
				"SELECT created_at, strip_path, gif_path, video_path FROM gallery_sessions WHERE id = ?1",
				params![session_id],
				|r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
			)
			.ok();

		let photos: Vec<String> = conn
			.prepare("SELECT file_path FROM gallery_photos WHERE session_id = ?1 ORDER BY sort_order ASC")
			.and_then(|mut s| {
				s.query_map(params![session_id], |r| r.get::<_, String>(0))
					.map(|rows| rows.filter_map(Result::ok).collect())
			})
			.unwrap_or_default();

		let prev: Option<(String, String, bool, String)> = conn
			.query_row(
				"SELECT drive_folder_id, drive_folder_url, is_public, uploaded_files_json FROM cloud_session_sync WHERE session_id = ?1",
				params![session_id],
				|r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0, r.get(3)?)),
			)
			.ok();

		(cfg, sess.map(|s| (s, photos)), prev)
	};

	let Some(((created_at, strip_path, gif_path, video_path), photo_files)) = session_info else {
		return fail_result(session_id, 0, 0, "Sesi galeri tidak ditemukan.");
	};

	let connected = !cfg.refresh_token.trim().is_empty() || !cfg.access_token.trim().is_empty();
	if !connected {
		return SyncResult {
			ok: false,
			session_id: session_id.to_string(),
			status: "skipped".to_string(),
			uploaded_count: 0,
			skipped_count: 0,
			is_public: false,
			drive_folder_url: None,
			error: Some("Google Drive belum terhubung.".to_string()),
		};
	}

	// Build upload list upfront so total_files is available immediately while uploading
	let mut files_to_sync: Vec<String> = Vec::new();
	if cfg.upload_strip {
		if let Some(s) = strip_path.filter(|v| !v.is_empty()) {
			files_to_sync.push(s);
		}
	}
	if cfg.upload_photos {
		for p in photo_files {
			if !p.is_empty() && !files_to_sync.contains(&p) {
				files_to_sync.push(p);
			}
		}
	}
	if cfg.upload_gif {
		if let Some(g) = gif_path.filter(|v| !v.is_empty()) {
			files_to_sync.push(g);
		}
	}
	if cfg.upload_video {
		if let Some(v) = video_path.filter(|v| !v.is_empty()) {
			files_to_sync.push(v);
		}
	}
	let planned_total = files_to_sync.len();

	let (mut folder_id, mut folder_url, mut is_public, mut uploaded_map) = match prev_sync {
		Some((fid, furl, pub_flag, raw_json)) => {
			let map: BTreeMap<String, String> =
				serde_json::from_str(&raw_json).unwrap_or_default();
			(fid, furl, pub_flag, map)
		}
		None => (String::new(), String::new(), false, BTreeMap::new()),
	};

	let access_token = match get_valid_access_token_with_endpoints(state, endpoints).await {
		Ok(t) => t,
		Err(err) => {
			upsert_sync_state(
				state,
				session_id,
				"failed",
				&folder_id,
				&folder_url,
				is_public,
				planned_total,
				&uploaded_map,
				&err,
			);
			record_cloud_queue(state, session_id, "failed", &err);
			return fail_result(session_id, 0, 0, &err);
		}
	};

	let client = match http_client() {
		Ok(c) => c,
		Err(err) => return fail_result(session_id, 0, 0, &err),
	};

	// Ensure Drive hierarchy: <RootFolder>/<YYYY-MM-DD>/sesi-<id>/
	if folder_id.is_empty() {
		let root_name = if cfg.root_folder_name.trim().is_empty() {
			"DISTUDIO Photobooth"
		} else {
			cfg.root_folder_name.trim()
		};
		let root_id = if !cfg.root_folder_id.trim().is_empty() {
			cfg.root_folder_id.clone()
		} else {
			match ensure_drive_folder(&client, endpoints, &access_token, root_name, None).await {
				Ok((id, _)) => {
					if let Ok(conn) = state.conn() {
						let _ = conn.execute(
							"UPDATE cloud_config SET root_folder_id = ?1 WHERE id = 1",
							params![id],
						);
					}
					id
				}
				Err(err) => {
					upsert_sync_state(
						state,
						session_id,
						"failed",
						"",
						"",
						false,
						planned_total,
						&uploaded_map,
						&err,
					);
					record_cloud_queue(state, session_id, "failed", &err);
					return fail_result(session_id, 0, 0, &err);
				}
			}
		};

		let date_bucket = created_at
			.get(0..10)
			.filter(|d| d.len() == 10 && d.as_bytes()[4] == b'-')
			.unwrap_or("arsip");
		let date_folder_id = match ensure_drive_folder(
			&client,
			endpoints,
			&access_token,
			date_bucket,
			Some(&root_id),
		)
		.await
		{
			Ok((id, _)) => id,
			Err(err) => {
				upsert_sync_state(
					state,
					session_id,
					"failed",
					"",
					"",
					false,
					planned_total,
					&uploaded_map,
					&err,
				);
				record_cloud_queue(state, session_id, "failed", &err);
				return fail_result(session_id, 0, 0, &err);
			}
		};

		let sess_folder_name = format!("sesi-{session_id}");
		match ensure_drive_folder(
			&client,
			endpoints,
			&access_token,
			&sess_folder_name,
			Some(&date_folder_id),
		)
		.await
		{
			Ok((id, link)) => {
				folder_id = id;
				folder_url = link;
			}
			Err(err) => {
				upsert_sync_state(
					state,
					session_id,
					"failed",
					"",
					"",
					false,
					planned_total,
					&uploaded_map,
					&err,
				);
				record_cloud_queue(state, session_id, "failed", &err);
				return fail_result(session_id, 0, 0, &err);
			}
		}
	}

	// Apply public viewer permission strictly to the per-session folder BEFORE uploading files,
	// so /print can display the public Drive QR within ~2 seconds while files finish uploading.
	let mut perm_warning = String::new();
	if cfg.public_share && !is_public && !folder_id.is_empty() {
		match ensure_folder_public_read(&client, endpoints, &access_token, &folder_id).await {
			Ok(()) => {
				is_public = true;
			}
			Err(err) => {
				is_public = false;
				perm_warning = err;
			}
		}
	}

	let session_dir = state.sessions_dir.join(session_id);
	let mut uploaded_count = 0usize;
	let mut skipped_count = 0usize;

	upsert_sync_state(
		state,
		session_id,
		"processing",
		&folder_id,
		&folder_url,
		is_public,
		planned_total,
		&uploaded_map,
		&perm_warning,
	);

	for fname in files_to_sync {
		if uploaded_map.contains_key(&fname) {
			skipped_count += 1;
			continue;
		}
		let Some(full_path) = resolve_safe_child(&session_dir, &fname) else {
			continue;
		};
		let Ok(bytes) = fs::read(&full_path) else {
			continue;
		};
		let mime = mime_for_path(&full_path);

		match upload_file_multipart(
			&client,
			endpoints,
			&access_token,
			&folder_id,
			&fname,
			mime,
			&bytes,
		)
		.await
		{
			Ok((file_id, _link)) => {
				uploaded_map.insert(fname, file_id);
				uploaded_count += 1;
				// Persist after each successful file so retry is strictly idempotent
				upsert_sync_state(
					state,
					session_id,
					"processing",
					&folder_id,
					&folder_url,
					is_public,
					planned_total,
					&uploaded_map,
					&perm_warning,
				);
			}
			Err(err) => {
				upsert_sync_state(
					state,
					session_id,
					"failed",
					&folder_id,
					&folder_url,
					is_public,
					planned_total,
					&uploaded_map,
					&err,
				);
				record_cloud_queue(state, session_id, "failed", &err);
				return fail_result(session_id, uploaded_count, skipped_count, &err);
			}
		}
	}

	let done_ts = now_iso();
	let total_files = (uploaded_count + skipped_count).max(planned_total);
	upsert_sync_state(
		state,
		session_id,
		"done",
		&folder_id,
		&folder_url,
		is_public,
		total_files,
		&uploaded_map,
		&perm_warning,
	);
	if let Ok(conn) = state.conn() {
		let _ = conn.execute(
			"UPDATE cloud_config SET last_sync_at = ?1, updated_at = ?1 WHERE id = 1",
			params![done_ts],
		);
	}

	let synced_files = uploaded_count + skipped_count;
	let share_note = if is_public { " · Publik" } else { "" };
	let detail = format!("{synced_files} berkas tersinkron ke Google Drive{share_note} · {folder_url}");
	record_cloud_queue(state, session_id, "done", &detail);

	SyncResult {
		ok: true,
		session_id: session_id.to_string(),
		status: "done".to_string(),
		uploaded_count,
		skipped_count,
		is_public,
		drive_folder_url: Some(folder_url),
		error: (!perm_warning.is_empty()).then_some(perm_warning),
	}
}

#[allow(clippy::too_many_arguments)]
fn upsert_sync_state(
	state: &AppState,
	session_id: &str,
	status: &str,
	folder_id: &str,
	folder_url: &str,
	is_public: bool,
	total_files: usize,
	uploaded_map: &BTreeMap<String, String>,
	last_error: &str,
) {
	let Ok(conn) = state.conn() else {
		return;
	};
	let uploaded_json = serde_json::to_string(uploaded_map).unwrap_or_else(|_| "{}".to_string());
	let _ = conn.execute(
		"
		INSERT INTO cloud_session_sync
			(session_id, status, drive_folder_id, drive_folder_url, is_public, total_files, uploaded_files_json, last_error, updated_at)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
		ON CONFLICT(session_id) DO UPDATE SET
			status = excluded.status,
			drive_folder_id = excluded.drive_folder_id,
			drive_folder_url = excluded.drive_folder_url,
			is_public = excluded.is_public,
			total_files = excluded.total_files,
			uploaded_files_json = excluded.uploaded_files_json,
			last_error = excluded.last_error,
			updated_at = excluded.updated_at
		",
		params![
			session_id,
			status,
			folder_id,
			folder_url,
			if is_public { 1 } else { 0 },
			total_files as i64,
			uploaded_json,
			last_error,
			now_iso(),
		],
	);
}

fn record_cloud_queue(state: &AppState, session_id: &str, status: &str, detail: &str) {
	let Ok(conn) = state.conn() else {
		return;
	};
	let existing_id: Option<String> = conn
		.query_row(
			"SELECT id FROM queue_items WHERE type = 'cloud-sync' AND ref_id = ?1 ORDER BY created_at DESC LIMIT 1",
			params![session_id],
			|r| r.get(0),
		)
		.ok();

	if let Some(qid) = existing_id {
		let _ = conn.execute(
			"UPDATE queue_items SET status = ?2, detail = ?3, updated_at = ?4 WHERE id = ?1",
			params![qid, status, detail.chars().take(500).collect::<String>(), now_iso()],
		);
	} else {
		let title = format!("Google Drive · sesi-{session_id}");
		let _ = enqueue_row(
			&conn,
			"cloud-sync",
			status,
			&title,
			Some(session_id),
			Some(detail),
			Some("google-drive"),
		);
	}
}

fn fail_result(session_id: &str, uploaded: usize, skipped: usize, err: &str) -> SyncResult {
	SyncResult {
		ok: false,
		session_id: session_id.to_string(),
		status: "failed".to_string(),
		uploaded_count: uploaded,
		skipped_count: skipped,
		is_public: false,
		drive_folder_url: None,
		error: Some(err.to_string()),
	}
}

// ─── Small HTTP/Crypto Helpers ──────────────────────────────────────────────

fn http_client() -> Result<reqwest::Client, String> {
	reqwest::Client::builder()
		.timeout(Duration::from_secs(45))
		.build()
		.map_err(|e| format!("Gagal inisialisasi HTTP client: {e}"))
}

fn resolve_redirect_uri(headers: &HeaderMap) -> String {
	let proto = headers
		.get("x-forwarded-proto")
		.and_then(|v| v.to_str().ok())
		.filter(|s| !s.trim().is_empty())
		.unwrap_or("http");
	let host = headers
		.get("x-forwarded-host")
		.or_else(|| headers.get(header::HOST))
		.and_then(|v| v.to_str().ok())
		.filter(|s| !s.trim().is_empty())
		.unwrap_or("localhost:5173");
	format!("{proto}://{host}/api/cloud/google/callback")
}

fn random_hex(num_bytes: usize) -> String {
	let mut bytes = vec![0u8; num_bytes];
	rand::thread_rng().fill_bytes(&mut bytes);
	bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn extract_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
	let prefix = format!("{name}=");
	for val in headers.get_all(header::COOKIE) {
		if let Ok(s) = val.to_str() {
			for part in s.split(';') {
				let trimmed = part.trim();
				if let Some(rest) = trimmed.strip_prefix(&prefix) {
					return Some(rest.to_string());
				}
			}
		}
	}
	None
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
	if a.len() != b.len() {
		return false;
	}
	let mut diff = 0u8;
	for (x, y) in a.iter().zip(b.iter()) {
		diff |= x ^ y;
	}
	diff == 0
}

fn redirect_with_cleared_cookie(location: &str) -> Response {
	let mut res = StatusCode::FOUND.into_response();
	if let Ok(loc) = HeaderValue::from_str(location) {
		res.headers_mut().insert(header::LOCATION, loc);
	}
	let clear = format!("{OAUTH_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
	if let Ok(ck) = HeaderValue::from_str(&clear) {
		res.headers_mut().insert(header::SET_COOKIE, ck);
	}
	res
}
