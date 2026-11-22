use std::collections::BTreeSet;
use std::fs;

use axum::extract::{Path as AxumPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::state::{
	binary_response, decode_data_url, ext_for_mime, mime_for_path, now_iso, ok_err,
	resolve_safe_child, safe_filename, slugify_id, url_encode_segment, AppState,
};

const BUILTIN_IDS: &[&str] = &["2x6", "2x8", "4r-double", "3r", "5r", "square"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFrameSizeDto {
	pub id: String,
	pub label: String,
	pub kind: String,
	pub px_w: i64,
	pub px_h: i64,
	pub cm: String,
	pub ratio: f64,
	pub photos: Vec<i64>,
	pub default_count: i64,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub thumbnail: Option<String>,
	pub source: &'static str,
	pub editable: bool,
	pub created_at: String,
	pub updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameSizeInput {
	pub id: Option<String>,
	pub label: Option<String>,
	pub kind: Option<String>,
	pub px_w: Option<Value>,
	pub px_h: Option<Value>,
	pub cm: Option<String>,
	pub photos: Option<Vec<Value>>,
	pub default_count: Option<Value>,
	pub thumbnail: Option<String>,
}

#[derive(Deserialize)]
pub struct FrameSizeDeleteBody {
	pub id: Option<String>,
}

struct CleanFrameSize {
	id: String,
	label: String,
	kind: String,
	px_w: i64,
	px_h: i64,
	cm: String,
	photos: Vec<i64>,
	default_count: i64,
	raw_thumb: Option<String>,
}

pub async fn get_frame_sizes(
	State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	let custom = list_custom_sizes(&conn);
	Ok(Json(json!({ "ok": true, "custom": custom })))
}

pub async fn post_frame_size(
	State(state): State<AppState>,
	Json(input): Json<FrameSizeInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let Some(clean) = sanitize_input(&input) else {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"Data frame size tidak valid.",
		));
	};

	if is_builtin(&clean.id) {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"ID bentrok dengan format bawaan (terkunci).",
		));
	}

	let conn = state.conn()?;
	if load_size_row(&conn, &clean.id).is_some() {
		return Err(ok_err(
			StatusCode::CONFLICT,
			"ID sudah ada. Gunakan edit.",
		));
	}

	let now = now_iso();
	let thumb_path = persist_thumbnail(&state, &clean.id, clean.raw_thumb.as_deref(), None);
	let photos_json = serde_json::to_string(&clean.photos).unwrap_or_else(|_| "[4]".to_string());

	conn.execute(
		"
		INSERT INTO frame_sizes
			(id, label, kind, px_w, px_h, cm, photos_json, default_count, thumbnail_path, created_at, updated_at)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
		",
		params![
			clean.id,
			clean.label,
			clean.kind,
			clean.px_w,
			clean.px_h,
			clean.cm,
			photos_json,
			clean.default_count,
			thumb_path,
			now,
			now,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let saved = load_size_row(&conn, &clean.id).map(|r| r.dto);
	Ok(Json(json!({ "ok": true, "item": saved })))
}

pub async fn put_frame_size(
	State(state): State<AppState>,
	Json(input): Json<FrameSizeInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let Some(clean) = sanitize_input(&input) else {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"Data frame size tidak valid.",
		));
	};

	if is_builtin(&clean.id) {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"Format bawaan tidak bisa diedit.",
		));
	}

	let conn = state.conn()?;
	let Some(prev) = load_size_row(&conn, &clean.id) else {
		return Err(ok_err(
			StatusCode::NOT_FOUND,
			"Frame size custom tidak ditemukan.",
		));
	};

	let now = now_iso();
	let thumb_path = persist_thumbnail(
		&state,
		&clean.id,
		clean.raw_thumb.as_deref(),
		prev.thumbnail_path.as_deref(),
	);
	if thumb_path.is_none() {
		if let Some(old_thumb) = prev.thumbnail_path.as_deref() {
			if let Some(p) = resolve_safe_child(&state.thumbnails_dir, old_thumb) {
				let _ = fs::remove_file(p);
			}
		}
	}

	let photos_json = serde_json::to_string(&clean.photos).unwrap_or_else(|_| "[4]".to_string());
	conn.execute(
		"
		UPDATE frame_sizes SET
			label = ?2,
			kind = ?3,
			px_w = ?4,
			px_h = ?5,
			cm = ?6,
			photos_json = ?7,
			default_count = ?8,
			thumbnail_path = ?9,
			updated_at = ?10
		WHERE id = ?1
		",
		params![
			clean.id,
			clean.label,
			clean.kind,
			clean.px_w,
			clean.px_h,
			clean.cm,
			photos_json,
			clean.default_count,
			thumb_path,
			now,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let saved = load_size_row(&conn, &clean.id).map(|r| r.dto);
	Ok(Json(json!({ "ok": true, "item": saved })))
}

pub async fn delete_frame_size(
	State(state): State<AppState>,
	Json(body): Json<FrameSizeDeleteBody>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
	let id = body.id.as_deref().map(str::trim).unwrap_or("");
	if id.is_empty() {
		return Err(ok_err(StatusCode::BAD_REQUEST, "ID diperlukan."));
	}
	if is_builtin(id) {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"Format bawaan tidak bisa dihapus.",
		));
	}

	let conn = state.conn()?;
	let prev = load_size_row(&conn, id);
	let affected = conn
		.execute("DELETE FROM frame_sizes WHERE id = ?1", params![id])
		.unwrap_or(0);
	if affected == 0 {
		return Ok((
			StatusCode::NOT_FOUND,
			Json(json!({ "ok": false, "error": "Tidak ditemukan." })),
		));
	}

	if let Some(old_thumb) = prev.and_then(|p| p.thumbnail_path) {
		if let Some(p) = resolve_safe_child(&state.thumbnails_dir, &old_thumb) {
			let _ = fs::remove_file(p);
		}
	}
	Ok((StatusCode::OK, Json(json!({ "ok": true }))))
}

pub async fn get_frame_size_thumbnail(
	State(state): State<AppState>,
	AxumPath(file): AxumPath<String>,
) -> Response {
	let Some(full) = resolve_safe_child(&state.thumbnails_dir, &file) else {
		return (StatusCode::BAD_REQUEST, "Invalid filename").into_response();
	};
	let Ok(bytes) = fs::read(&full) else {
		return (StatusCode::NOT_FOUND, "Not found").into_response();
	};
	binary_response(bytes, mime_for_path(&full), "public, max-age=3600")
}

struct FrameSizeRecord {
	dto: CustomFrameSizeDto,
	thumbnail_path: Option<String>,
}

fn load_size_row(conn: &Connection, id: &str) -> Option<FrameSizeRecord> {
	conn.query_row(
		"
		SELECT id, label, kind, px_w, px_h, cm, photos_json, default_count,
			   thumbnail_path, created_at, updated_at
		FROM frame_sizes WHERE id = ?1
		",
		params![id],
		map_size_row,
	)
	.ok()
}

fn list_custom_sizes(conn: &Connection) -> Vec<CustomFrameSizeDto> {
	let Ok(mut stmt) = conn.prepare(
		"
		SELECT id, label, kind, px_w, px_h, cm, photos_json, default_count,
			   thumbnail_path, created_at, updated_at
		FROM frame_sizes
		ORDER BY updated_at DESC
		",
	) else {
		return Vec::new();
	};
	let Ok(rows) = stmt.query_map([], map_size_row) else {
		return Vec::new();
	};
	rows.filter_map(Result::ok).map(|r| r.dto).collect()
}

fn map_size_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<FrameSizeRecord> {
	let px_w: i64 = r.get(3)?;
	let px_h: i64 = r.get(4)?;
	let photos_json: String = r.get(6)?;
	let photos: Vec<i64> = serde_json::from_str(&photos_json).unwrap_or_else(|_| vec![4]);
	let thumb_path: Option<String> = r.get(8)?;
	let thumbnail = thumb_path
		.as_deref()
		.filter(|s| !s.is_empty())
		.map(|f| format!("/api/frame-sizes/thumbnails/{}", url_encode_segment(f)));

	Ok(FrameSizeRecord {
		dto: CustomFrameSizeDto {
			id: r.get(0)?,
			label: r.get(1)?,
			kind: r.get(2)?,
			px_w,
			px_h,
			cm: r.get(5)?,
			ratio: if px_w > 0 && px_h > 0 {
				px_w as f64 / px_h as f64
			} else {
				1.0
			},
			photos,
			default_count: r.get(7)?,
			thumbnail,
			source: "custom",
			editable: true,
			created_at: r.get(9)?,
			updated_at: r.get(10)?,
		},
		thumbnail_path: thumb_path,
	})
}

fn sanitize_input(input: &FrameSizeInput) -> Option<CleanFrameSize> {
	let id = slugify_id(input.id.as_deref()?);
	if id.is_empty() {
		return None;
	}
	let px_w = parse_num(input.px_w.as_ref()).clamp(100, 12000);
	let px_h = parse_num(input.px_h.as_ref()).clamp(100, 12000);

	let mut set = BTreeSet::new();
	if let Some(arr) = input.photos.as_ref() {
		for val in arr {
			let n = parse_num(Some(val));
			if (1..=12).contains(&n) {
				set.insert(n);
			}
		}
	}
	if set.is_empty() {
		return None;
	}
	let photos: Vec<i64> = set.into_iter().collect();
	let req_default = parse_num(input.default_count.as_ref());
	let default_count = if photos.contains(&req_default) {
		req_default
	} else {
		photos[0]
	};

	let kind = if input.kind.as_deref() == Some("digital") {
		"digital".to_string()
	} else {
		"print".to_string()
	};
	let label = input
		.label
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or(&id)
		.chars()
		.take(80)
		.collect::<String>();
	let default_cm = format!(
		"{:.2} × {:.2} cm",
		px_w as f64 / 118.11,
		px_h as f64 / 118.11
	);
	let cm = input
		.cm
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or(&default_cm)
		.chars()
		.take(80)
		.collect::<String>();

	Some(CleanFrameSize {
		id,
		label,
		kind,
		px_w,
		px_h,
		cm,
		photos,
		default_count,
		raw_thumb: input
			.thumbnail
			.as_deref()
			.map(str::trim)
			.filter(|s| !s.is_empty())
			.map(str::to_string),
	})
}

fn persist_thumbnail(
	state: &AppState,
	id: &str,
	raw_thumb: Option<&str>,
	prev_path: Option<&str>,
) -> Option<String> {
	let raw = raw_thumb?.trim();
	if raw.starts_with("/api/frame-sizes/thumbnails/") {
		return prev_path.map(str::to_string);
	}
	if raw.len() > 700_000 {
		return prev_path.map(str::to_string);
	}
	if let Some((mime, bytes)) = decode_data_url(raw) {
		let ext = ext_for_mime(&mime);
		if matches!(ext, "png" | "jpg" | "webp") {
			let fname = safe_filename(&format!("{id}.{ext}"));
			if fs::write(state.thumbnails_dir.join(&fname), bytes).is_ok() {
				return Some(fname);
			}
		}
	}
	None
}

fn parse_num(v: Option<&Value>) -> i64 {
	v.and_then(|val| {
		val.as_i64()
			.or_else(|| val.as_f64().filter(|n| n.is_finite()).map(|n| n.round() as i64))
	})
	.unwrap_or(0)
}

fn is_builtin(id: &str) -> bool {
	BUILTIN_IDS.contains(&id)
}
