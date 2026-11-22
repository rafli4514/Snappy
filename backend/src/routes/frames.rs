use std::fs;

use axum::extract::{Path as AxumPath, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::state::{
	binary_response, decode_data_url, ext_for_mime, mime_for_path, now_millis, ok_err,
	resolve_safe_child, safe_filename, slugify_id, uid, url_encode_segment, AppState,
};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PhotoFrameDto {
	pub id: String,
	pub name: String,
	pub slot_count: i64,
	pub design_width: i64,
	pub design_height: i64,
	pub artwork_data_url: String,
	pub slots: Value,
	pub focal: String,
	pub source: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub format_id: Option<String>,
	pub enabled: bool,
	pub created_at: i64,
	pub updated_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameListQuery {
	pub enabled: Option<String>,
	pub format_id: Option<String>,
	pub slot_count: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameUpsertInput {
	pub id: Option<String>,
	pub name: Option<String>,
	pub slot_count: Option<i64>,
	pub design_width: Option<i64>,
	pub design_height: Option<i64>,
	pub artwork_data_url: Option<String>,
	pub slots: Option<Value>,
	pub focal: Option<String>,
	pub source: Option<String>,
	pub format_id: Option<Value>,
	pub enabled: Option<bool>,
	pub created_at: Option<i64>,
	pub updated_at: Option<i64>,
}

#[derive(Deserialize)]
pub struct DeleteFrameBody {
	pub id: Option<String>,
}

pub async fn get_frames(
	State(state): State<AppState>,
	Query(q): Query<FrameListQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	let mut items = list_all_frames(&conn)
		.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	if let Some(enabled_q) = q.enabled.as_deref() {
		let want = matches!(enabled_q, "1" | "true" | "yes");
		items.retain(|f| f.enabled == want);
	}
	if let Some(fmt) = q.format_id.as_deref().filter(|s| !s.trim().is_empty()) {
		items.retain(|f| f.format_id.as_deref() == Some(fmt));
	}
	if let Some(sc) = q.slot_count {
		items.retain(|f| f.slot_count == sc);
	}

	Ok(Json(json!({ "ok": true, "items": items })))
}

pub async fn post_frame(
	State(state): State<AppState>,
	Json(input): Json<FrameUpsertInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let now = now_millis();
	let raw_id = input.id.as_deref().map(slugify_id).filter(|s| !s.is_empty());
	let id = raw_id.unwrap_or_else(|| uid("frame", "-"));

	let conn = state.conn()?;
	let prev = load_frame_row(&conn, &id);

	let name = input
		.name
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.map(str::to_string)
		.or_else(|| prev.as_ref().map(|p| p.dto.name.clone()))
		.unwrap_or_else(|| id.clone());

	let slots = input
		.slots
		.filter(|v| v.is_array())
		.or_else(|| prev.as_ref().map(|p| p.dto.slots.clone()))
		.unwrap_or_else(|| json!([]));
	let inferred_slots = slots.as_array().map(|a| a.len() as i64).unwrap_or(1);

	let slot_count = input
		.slot_count
		.or_else(|| prev.as_ref().map(|p| p.dto.slot_count))
		.unwrap_or(inferred_slots)
		.clamp(1, 16);
	let design_width = input
		.design_width
		.or_else(|| prev.as_ref().map(|p| p.dto.design_width))
		.unwrap_or(600)
		.clamp(64, 12000);
	let design_height = input
		.design_height
		.or_else(|| prev.as_ref().map(|p| p.dto.design_height))
		.unwrap_or(1800)
		.clamp(64, 12000);

	let updated_at = input.updated_at.unwrap_or(now);
	let created_at = prev
		.as_ref()
		.map(|p| p.dto.created_at)
		.or(input.created_at)
		.unwrap_or(now);

	let artwork_path = save_or_keep_artwork(
		&state,
		&id,
		updated_at,
		input.artwork_data_url.as_deref(),
		prev.as_ref().map(|p| p.artwork_path.as_str()),
	)?;

	let focal = match input.focal.as_deref() {
		Some("top") => "top".to_string(),
		Some("center") => "center".to_string(),
		_ => prev
			.as_ref()
			.map(|p| p.dto.focal.clone())
			.unwrap_or_else(|| "center".to_string()),
	};

	let source = match input.source.as_deref() {
		Some("seed") => "seed".to_string(),
		Some("upload") => "upload".to_string(),
		_ => prev
			.as_ref()
			.map(|p| p.dto.source.clone())
			.unwrap_or_else(|| "upload".to_string()),
	};

	let format_id = resolve_format_id(
		input.format_id.as_ref(),
		prev.as_ref().and_then(|p| p.dto.format_id.clone()),
	);
	let enabled = input
		.enabled
		.unwrap_or_else(|| prev.as_ref().map(|p| p.dto.enabled).unwrap_or(true));

	let slots_json = serde_json::to_string(&slots).unwrap_or_else(|_| "[]".to_string());

	conn.execute(
		"
		INSERT INTO frames
			(id, name, format_id, slot_count, design_width, design_height, artwork_path, slots_json, focal, source, enabled, created_at, updated_at)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			format_id = excluded.format_id,
			slot_count = excluded.slot_count,
			design_width = excluded.design_width,
			design_height = excluded.design_height,
			artwork_path = excluded.artwork_path,
			slots_json = excluded.slots_json,
			focal = excluded.focal,
			source = excluded.source,
			enabled = excluded.enabled,
			updated_at = excluded.updated_at
		",
		params![
			id,
			name,
			format_id,
			slot_count,
			design_width,
			design_height,
			artwork_path,
			slots_json,
			focal,
			source,
			if enabled { 1 } else { 0 },
			created_at,
			updated_at,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let saved = load_frame_row(&conn, &id)
		.ok_or_else(|| ok_err(StatusCode::INTERNAL_SERVER_ERROR, "Gagal membaca frame tersimpan"))?;
	Ok(Json(json!({ "ok": true, "item": saved.dto })))
}

pub async fn put_frame(
	State(state): State<AppState>,
	Json(input): Json<FrameUpsertInput>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let Some(raw_id) = input.id.as_deref().map(slugify_id).filter(|s| !s.is_empty()) else {
		return Err(ok_err(StatusCode::BAD_REQUEST, "id frame diperlukan."));
	};

	let conn = state.conn()?;
	let Some(prev) = load_frame_row(&conn, &raw_id) else {
		return Err(ok_err(StatusCode::NOT_FOUND, "Frame tidak ditemukan."));
	};

	let now = now_millis();
	let name = input
		.name
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.map(str::to_string)
		.unwrap_or_else(|| prev.dto.name.clone());
	let slots = input
		.slots
		.filter(|v| v.is_array())
		.unwrap_or_else(|| prev.dto.slots.clone());
	let slot_count = input.slot_count.unwrap_or(prev.dto.slot_count).clamp(1, 16);
	let design_width = input
		.design_width
		.unwrap_or(prev.dto.design_width)
		.clamp(64, 12000);
	let design_height = input
		.design_height
		.unwrap_or(prev.dto.design_height)
		.clamp(64, 12000);
	let focal = match input.focal.as_deref() {
		Some("top") => "top".to_string(),
		Some("center") => "center".to_string(),
		_ => prev.dto.focal.clone(),
	};
	let format_id = resolve_format_id(input.format_id.as_ref(), prev.dto.format_id.clone());
	let enabled = input.enabled.unwrap_or(prev.dto.enabled);

	let artwork_path = save_or_keep_artwork(
		&state,
		&raw_id,
		now,
		input.artwork_data_url.as_deref(),
		Some(prev.artwork_path.as_str()),
	)?;

	let slots_json = serde_json::to_string(&slots).unwrap_or_else(|_| "[]".to_string());
	conn.execute(
		"
		UPDATE frames SET
			name = ?2,
			format_id = ?3,
			slot_count = ?4,
			design_width = ?5,
			design_height = ?6,
			artwork_path = ?7,
			slots_json = ?8,
			focal = ?9,
			enabled = ?10,
			updated_at = ?11
		WHERE id = ?1
		",
		params![
			raw_id,
			name,
			format_id,
			slot_count,
			design_width,
			design_height,
			artwork_path,
			slots_json,
			focal,
			if enabled { 1 } else { 0 },
			now,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let saved = load_frame_row(&conn, &raw_id)
		.ok_or_else(|| ok_err(StatusCode::INTERNAL_SERVER_ERROR, "Gagal membaca frame"))?;
	Ok(Json(json!({ "ok": true, "item": saved.dto })))
}

pub async fn delete_frame(
	State(state): State<AppState>,
	Json(body): Json<DeleteFrameBody>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
	let Some(id) = body
		.id
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
	else {
		return Err(ok_err(StatusCode::BAD_REQUEST, "id diperlukan."));
	};

	let conn = state.conn()?;
	let prev = load_frame_row(&conn, id);
	let affected = conn
		.execute("DELETE FROM frames WHERE id = ?1", params![id])
		.unwrap_or(0);
	if affected == 0 {
		return Ok((
			StatusCode::NOT_FOUND,
			Json(json!({ "ok": false, "error": "Tidak ditemukan." })),
		));
	}

	if let Some(p) = prev {
		if let Some(full) = resolve_safe_child(&state.frames_dir, &p.artwork_path) {
			let _ = fs::remove_file(full);
		}
	}
	Ok((StatusCode::OK, Json(json!({ "ok": true }))))
}

pub async fn get_frame_file(
	State(state): State<AppState>,
	AxumPath(file): AxumPath<String>,
) -> Response {
	let Some(full) = resolve_safe_child(&state.frames_dir, &file) else {
		return (StatusCode::BAD_REQUEST, "Invalid filename").into_response();
	};
	let Ok(bytes) = fs::read(&full) else {
		return (StatusCode::NOT_FOUND, "Not found").into_response();
	};
	binary_response(bytes, mime_for_path(&full), "public, max-age=3600")
}

struct FrameRowRecord {
	dto: PhotoFrameDto,
	artwork_path: String,
}

fn load_frame_row(conn: &Connection, id: &str) -> Option<FrameRowRecord> {
	conn.query_row(
		"
		SELECT id, name, format_id, slot_count, design_width, design_height,
			   artwork_path, slots_json, focal, source, enabled, created_at, updated_at
		FROM frames WHERE id = ?1
		",
		params![id],
		map_frame_row,
	)
	.ok()
}

fn list_all_frames(conn: &Connection) -> rusqlite::Result<Vec<PhotoFrameDto>> {
	let mut stmt = conn.prepare(
		"
		SELECT id, name, format_id, slot_count, design_width, design_height,
			   artwork_path, slots_json, focal, source, enabled, created_at, updated_at
		FROM frames
		ORDER BY updated_at DESC
		",
	)?;
	let rows = stmt.query_map([], map_frame_row)?;
	Ok(rows.filter_map(Result::ok).map(|r| r.dto).collect())
}

fn map_frame_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<FrameRowRecord> {
	let id: String = r.get(0)?;
	let artwork_path: String = r.get(6)?;
	let slots_json: String = r.get(7)?;
	let slots: Value = serde_json::from_str(&slots_json).unwrap_or_else(|_| json!([]));
	let artwork_data_url = if artwork_path.is_empty() {
		String::new()
	} else {
		format!("/api/assets/frames/{}", url_encode_segment(&artwork_path))
	};
	Ok(FrameRowRecord {
		dto: PhotoFrameDto {
			id,
			name: r.get(1)?,
			format_id: r.get(2)?,
			slot_count: r.get(3)?,
			design_width: r.get(4)?,
			design_height: r.get(5)?,
			artwork_data_url,
			slots,
			focal: r.get(8)?,
			source: r.get(9)?,
			enabled: r.get::<_, i64>(10)? != 0,
			created_at: r.get(11)?,
			updated_at: r.get(12)?,
		},
		artwork_path,
	})
}

fn save_or_keep_artwork(
	state: &AppState,
	frame_id: &str,
	stamp: i64,
	incoming: Option<&str>,
	prev_path: Option<&str>,
) -> Result<String, (StatusCode, Json<Value>)> {
	let raw = incoming.map(str::trim).unwrap_or("");
	if let Some((mime, bytes)) = decode_data_url(raw) {
		let ext = ext_for_mime(&mime);
		let file_name = safe_filename(&format!("{frame_id}-{stamp}.{ext}"));
		let target = state.frames_dir.join(&file_name);
		fs::write(&target, bytes)
			.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, format!("Gagal simpan artwork: {e}")))?;
		if let Some(old) = prev_path.filter(|p| !p.is_empty() && *p != file_name) {
			if let Some(old_path) = resolve_safe_child(&state.frames_dir, old) {
				let _ = fs::remove_file(old_path);
			}
		}
		return Ok(file_name);
	}

	if let Some(existing) = prev_path.filter(|p| !p.is_empty()) {
		return Ok(existing.to_string());
	}

	Err(ok_err(
		StatusCode::BAD_REQUEST,
		"artworkDataUrl PNG atau SVG diperlukan.",
	))
}

fn resolve_format_id(incoming: Option<&Value>, prev: Option<String>) -> Option<String> {
	match incoming {
		Some(Value::Null) => None,
		Some(Value::String(s)) => {
			let trimmed = s.trim();
			if trimmed.is_empty() {
				None
			} else {
				Some(trimmed.to_string())
			}
		}
		_ => prev,
	}
}
