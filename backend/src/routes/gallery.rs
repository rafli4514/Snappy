use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};

use axum::extract::{Path as AxumPath, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::migrations::{persist_gallery_session, GallerySessionPayload};
use crate::state::{
	binary_response, is_safe_id, mime_for_path, resolve_safe_child, simple_err, url_encode_segment,
	AppState,
};

#[derive(Deserialize)]
pub struct GalleryListQuery {
	pub list: Option<String>,
	pub limit: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GallerySessionSummary {
	pub id: String,
	pub created_at: String,
	pub photo_count: i64,
	pub template_key: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub format_id: Option<String>,
	pub has_gif: bool,
	pub has_video: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GallerySessionResponse {
	pub id: String,
	pub created_at: String,
	pub photos: Vec<String>,
	pub strip_data_url: String,
	pub template_key: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub format_id: Option<String>,
	pub gif_data_url: Option<String>,
	pub video_data_url: Option<String>,
}

pub async fn post_gallery(
	State(state): State<AppState>,
	Json(payload): Json<GallerySessionPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let Some(id) = payload
		.id
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
	else {
		return Err(simple_err(
			StatusCode::BAD_REQUEST,
			"Missing session ID or data",
		));
	};

	if !is_safe_id(id) {
		return Err(simple_err(StatusCode::BAD_REQUEST, "Invalid session ID"));
	}

	let id_owned = id.to_string();
	let (qr_mode, cloud_eligible) = {
		let mut conn = state.conn()?;
		persist_gallery_session(&mut conn, &state, &id_owned, &payload)
			.map_err(|e| simple_err(StatusCode::INTERNAL_SERVER_ERROR, e))?;
		crate::routes::cloud::cloud_qr_meta(&conn)
	};

	crate::routes::cloud::trigger_auto_sync_async(state.clone(), id_owned.clone());

	Ok(Json(json!({
		"ok": true,
		"id": id_owned,
		"qrMode": qr_mode,
		"cloudEligible": cloud_eligible
	})))
}

pub async fn get_gallery_index(
	State(state): State<AppState>,
	Query(query): Query<GalleryListQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	if query.list.as_deref() == Some("1") {
		let limit = query.limit.unwrap_or(50).clamp(1, 200);
		let conn = state.conn()?;
		let mut stmt = conn
			.prepare(
				"
				SELECT id, created_at, photo_count, template_key, format_id, gif_path, video_path
				FROM gallery_sessions
				ORDER BY created_at DESC
				LIMIT ?1
				",
			)
			.map_err(|e| simple_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

		let rows = stmt
			.query_map(params![limit], |r| {
				let gif_path: Option<String> = r.get(5)?;
				let video_path: Option<String> = r.get(6)?;
				Ok(GallerySessionSummary {
					id: r.get(0)?,
					created_at: r.get(1)?,
					photo_count: r.get(2)?,
					template_key: r.get(3)?,
					format_id: r.get(4)?,
					has_gif: gif_path.as_deref().is_some_and(|s| !s.is_empty()),
					has_video: video_path.as_deref().is_some_and(|s| !s.is_empty()),
				})
			})
			.map_err(|e| simple_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

		let sessions: Vec<GallerySessionSummary> = rows.filter_map(Result::ok).collect();
		return Ok(Json(json!({ "ok": true, "sessions": sessions })));
	}

	Ok(Json(json!({ "ok": true, "message": "DISTUDIO Gallery API" })))
}

pub async fn get_gallery_by_id(
	State(state): State<AppState>,
	AxumPath(id): AxumPath<String>,
) -> Result<Json<GallerySessionResponse>, (StatusCode, Json<Value>)> {
	if !is_safe_id(&id) {
		return Err(simple_err(StatusCode::BAD_REQUEST, "Missing or invalid session ID"));
	}

	let conn = state.conn()?;
	let row = conn.query_row(
		"
		SELECT id, created_at, template_key, format_id, strip_path, gif_path, video_path
		FROM gallery_sessions
		WHERE id = ?1
		",
		params![id],
		|r| {
			Ok((
				r.get::<_, String>(0)?,
				r.get::<_, String>(1)?,
				r.get::<_, String>(2)?,
				r.get::<_, Option<String>>(3)?,
				r.get::<_, Option<String>>(4)?,
				r.get::<_, Option<String>>(5)?,
				r.get::<_, Option<String>>(6)?,
			))
		},
	);

	let (sid, created_at, template_key, format_id, strip_path, gif_path, video_path) = match row {
		Ok(val) => val,
		Err(_) => return Err(simple_err(StatusCode::NOT_FOUND, "Session not found")),
	};

	let mut stmt = conn
		.prepare(
			"SELECT file_path FROM gallery_photos WHERE session_id = ?1 ORDER BY sort_order ASC",
		)
		.map_err(|e| simple_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let enc_sid = url_encode_segment(&sid);
	let photos: Vec<String> = stmt
		.query_map(params![sid], |r| r.get::<_, String>(0))
		.map_err(|e| simple_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
		.filter_map(Result::ok)
		.map(|fname| format!("/api/gallery/{enc_sid}/media/{}", url_encode_segment(&fname)))
		.collect();

	let strip_data_url = strip_path
		.as_deref()
		.filter(|s| !s.is_empty())
		.map(|_| format!("/api/gallery/{enc_sid}/strip"))
		.unwrap_or_default();

	let gif_data_url = gif_path
		.as_deref()
		.filter(|s| !s.is_empty())
		.map(|fname| format!("/api/gallery/{enc_sid}/media/{}", url_encode_segment(fname)));

	let video_data_url = video_path
		.as_deref()
		.filter(|s| !s.is_empty())
		.map(|fname| format!("/api/gallery/{enc_sid}/media/{}", url_encode_segment(fname)));

	Ok(Json(GallerySessionResponse {
		id: sid,
		created_at,
		photos,
		strip_data_url,
		template_key,
		format_id,
		gif_data_url,
		video_data_url,
	}))
}

pub async fn delete_gallery_by_id(
	State(state): State<AppState>,
	AxumPath(id): AxumPath<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	if !is_safe_id(&id) {
		return Err((
			StatusCode::BAD_REQUEST,
			Json(json!({ "ok": false, "error": "ID sesi diperlukan." })),
		));
	}

	let affected = {
		let conn = state.conn()?;
		conn.execute("DELETE FROM gallery_sessions WHERE id = ?1", params![id])
			.unwrap_or(0)
	};

	let session_dir = state.sessions_dir.join(&id);
	let mut removed_disk = false;
	if session_dir.exists() && fs::remove_dir_all(&session_dir).is_ok() {
		removed_disk = true;
	}
	if let Some(legacy_json) = resolve_safe_child(&state.cache_dir, &format!("{id}.json")) {
		if legacy_json.is_file() && fs::remove_file(&legacy_json).is_ok() {
			removed_disk = true;
		}
	}

	if affected == 0 && !removed_disk {
		return Err((
			StatusCode::NOT_FOUND,
			Json(json!({ "ok": false, "error": "Sesi tidak ditemukan." })),
		));
	}

	Ok(Json(json!({ "ok": true, "id": id })))
}

pub async fn get_gallery_strip(
	State(state): State<AppState>,
	AxumPath(id): AxumPath<String>,
) -> Response {
	if !is_safe_id(&id) {
		return (StatusCode::BAD_REQUEST, "Missing session ID").into_response();
	}

	let file_name: Option<String> = {
		let Ok(conn) = state.conn() else {
			return (StatusCode::INTERNAL_SERVER_ERROR, "DB error").into_response();
		};

		let strip: Option<String> = conn
			.query_row(
				"SELECT strip_path FROM gallery_sessions WHERE id = ?1",
				params![id],
				|r| r.get(0),
			)
			.ok()
			.flatten();

		if strip.as_deref().is_some_and(|s| !s.is_empty()) {
			strip
		} else {
			let exists: bool = conn
				.query_row(
					"SELECT 1 FROM gallery_sessions WHERE id = ?1",
					params![id],
					|_| Ok(true),
				)
				.unwrap_or(false);
			if !exists {
				return (StatusCode::NOT_FOUND, "Session not found").into_response();
			}
			conn.query_row(
				"SELECT file_path FROM gallery_photos WHERE session_id = ?1 ORDER BY sort_order ASC LIMIT 1",
				params![id],
				|r| r.get::<_, String>(0),
			)
			.ok()
		}
	};

	let Some(fname) = file_name else {
		return (StatusCode::NOT_FOUND, "Image unavailable").into_response();
	};

	let session_dir = state.sessions_dir.join(&id);
	let Some(full_path) = resolve_safe_child(&session_dir, &fname) else {
		return (StatusCode::BAD_REQUEST, "Invalid file path").into_response();
	};
	let Ok(bytes) = fs::read(&full_path) else {
		return (StatusCode::NOT_FOUND, "Image unavailable").into_response();
	};

	let mime = mime_for_path(&full_path);
	binary_response(bytes, mime, "private, max-age=3600")
}

pub async fn get_gallery_media(
	State(state): State<AppState>,
	AxumPath((id, file)): AxumPath<(String, String)>,
	headers: HeaderMap,
) -> Response {
	if !is_safe_id(&id) {
		return (StatusCode::BAD_REQUEST, "Invalid session ID").into_response();
	}

	let session_dir = state.sessions_dir.join(&id);
	let Some(full_path) = resolve_safe_child(&session_dir, &file) else {
		return (StatusCode::BAD_REQUEST, "Invalid filename").into_response();
	};

	let Ok(mut f) = File::open(&full_path) else {
		return (StatusCode::NOT_FOUND, "Not found").into_response();
	};
	let Ok(meta) = f.metadata() else {
		return (StatusCode::NOT_FOUND, "Not found").into_response();
	};

	let total = meta.len();
	let mime = mime_for_path(&full_path);

	if let Some(range_hdr) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
		if let Some((start, end)) = parse_byte_range(range_hdr, total) {
			let len = end - start + 1;
			if f.seek(SeekFrom::Start(start)).is_ok() {
				let mut buf = vec![0u8; len as usize];
				if f.take(len).read_exact(&mut buf).is_ok() {
					let mut res = (StatusCode::PARTIAL_CONTENT, buf).into_response();
					let h = res.headers_mut();
					if let Ok(v) = HeaderValue::from_str(mime) {
						h.insert(header::CONTENT_TYPE, v);
					}
					h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
					if let Ok(v) = HeaderValue::from_str(&format!("bytes {start}-{end}/{total}")) {
						h.insert(header::CONTENT_RANGE, v);
					}
					if let Ok(v) = HeaderValue::from_str(&len.to_string()) {
						h.insert(header::CONTENT_LENGTH, v);
					}
					h.insert(
						header::CACHE_CONTROL,
						HeaderValue::from_static("private, max-age=3600"),
					);
					return res;
				}
			}
			return (
				StatusCode::RANGE_NOT_SATISFIABLE,
				[(header::CONTENT_RANGE, format!("bytes */{total}"))],
			)
				.into_response();
		}
	}

	let mut buf = Vec::with_capacity(total as usize);
	if f.read_to_end(&mut buf).is_err() {
		return (StatusCode::INTERNAL_SERVER_ERROR, "Read error").into_response();
	}

	let mut res = binary_response(buf, mime, "private, max-age=3600");
	res.headers_mut()
		.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
	res
}

fn parse_byte_range(header_val: &str, total: u64) -> Option<(u64, u64)> {
	if total == 0 {
		return None;
	}
	let spec = header_val.trim().strip_prefix("bytes=")?;
	let (start_s, end_s) = spec.split_once('-')?;
	if start_s.is_empty() {
		let suffix = end_s.trim().parse::<u64>().ok()?;
		if suffix == 0 {
			return None;
		}
		let start = total.saturating_sub(suffix);
		return Some((start, total - 1));
	}
	let start = start_s.trim().parse::<u64>().ok()?;
	if start >= total {
		return None;
	}
	let end = if end_s.trim().is_empty() {
		total - 1
	} else {
		end_s.trim().parse::<u64>().ok()?.min(total - 1)
	};
	if start > end {
		return None;
	}
	Some((start, end))
}
