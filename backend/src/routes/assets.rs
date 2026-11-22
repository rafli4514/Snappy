use std::fs;

use axum::extract::{Multipart, Path as AxumPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use rand::Rng;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::state::{
	binary_response, mime_for_path, now_iso, ok_err, resolve_safe_child, safe_filename, slugify_id,
	uid, url_encode_segment, AppState,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StickerSizeDto {
	pub w: i64,
	pub h: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomStickerDto {
	pub db_id: i64,
	pub name: String,
	pub file: String,
	pub size: StickerSizeDto,
	pub active: bool,
	pub category: String,
	pub source: &'static str,
	pub url: String,
	pub enabled: bool,
	pub created_at: String,
	pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFilterDto {
	pub key: String,
	pub name: String,
	pub category: String,
	pub css_filter: String,
	pub ffmpeg: String,
	pub source: &'static str,
	pub enabled: bool,
	pub created_at: String,
	pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomArDto {
	pub id: String,
	pub name: String,
	pub file: String,
	pub url: String,
	pub mime: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub width: Option<i64>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub height: Option<i64>,
	pub enabled: bool,
	pub created_at: String,
	pub updated_at: String,
}

pub async fn get_all_assets(
	State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	let stickers = query_stickers(&conn);
	let filters = query_filters(&conn);
	let ar = query_ar(&conn);
	Ok(Json(json!({
		"ok": true,
		"stickers": stickers,
		"filters": filters,
		"ar": ar
	})))
}

// ─── Stickers ───────────────────────────────────────────────────────────────

pub async fn get_stickers(State(state): State<AppState>) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	Ok(Json(json!({ "ok": true, "items": query_stickers(&conn) })))
}

pub async fn post_sticker(
	State(state): State<AppState>,
	mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let mut file_name: Option<String> = None;
	let mut file_bytes: Option<Vec<u8>> = None;
	let mut name_field: Option<String> = None;
	let mut category_field: Option<String> = None;
	let mut width_val: i64 = 0;
	let mut height_val: i64 = 0;

	while let Ok(Some(field)) = multipart.next_field().await {
		let fname_attr = field.name().unwrap_or("").to_string();
		match fname_attr.as_str() {
			"file" => {
				file_name = field.file_name().map(str::to_string);
				let bytes = field
					.bytes()
					.await
					.map_err(|e| ok_err(StatusCode::BAD_REQUEST, format!("Gagal baca file: {e}")))?;
				file_bytes = Some(bytes.to_vec());
			}
			"name" => {
				name_field = field.text().await.ok();
			}
			"category" => {
				category_field = field.text().await.ok();
			}
			"width" => {
				if let Ok(t) = field.text().await {
					width_val = t.trim().parse::<f64>().unwrap_or(0.0).round() as i64;
				}
			}
			"height" => {
				if let Ok(t) = field.text().await {
					height_val = t.trim().parse::<f64>().unwrap_or(0.0).round() as i64;
				}
			}
			_ => {}
		}
	}

	let (Some(orig_name), Some(bytes)) = (file_name, file_bytes) else {
		return Err(ok_err(StatusCode::BAD_REQUEST, "File sticker diperlukan."));
	};

	if !has_allowed_ext(&orig_name, &["png", "webp", "gif", "svg", "jpg", "jpeg"]) {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"Format file harus gambar (PNG/WebP/GIF/SVG/JPG).",
		));
	}

	if bytes.len() > 4 * 1024 * 1024 {
		return Err(ok_err(
			StatusCode::PAYLOAD_TOO_LARGE,
			"Ukuran sticker maksimal 4 MB.",
		));
	}

	if width_val > 0 && height_val > 0 && (width_val.min(height_val) < 64 || width_val.max(height_val) < 100) {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			format!(
				"Resolusi stiker terlalu kecil ({width_val} × {height_val} px). Minimal 100 px (sisi terpendek ≥ 64 px)."
			),
		));
	}

	let stored_name = safe_filename(&orig_name);
	fs::write(state.stickers_dir.join(&stored_name), &bytes)
		.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let default_name = orig_name
		.rsplit_once('.')
		.map(|(stem, _)| stem)
		.unwrap_or(&orig_name);
	let label: String = name_field
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or(default_name)
		.chars()
		.take(80)
		.collect();
	let category: String = category_field
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or("Custom")
		.chars()
		.take(40)
		.collect();

	let safe_w = if width_val > 0 { width_val.clamp(64, 8000) } else { 200 };
	let safe_h = if height_val > 0 { height_val.clamp(64, 8000) } else { 200 };
	let now = now_iso();

	let conn = state.conn()?;
	let prev_id: Option<(i64, String, bool, bool)> = conn
		.query_row(
			"SELECT db_id, created_at, active, enabled FROM stickers WHERE file_name = ?1",
			params![stored_name],
			|r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0, r.get::<_, i64>(3)? != 0)),
		)
		.ok();

	let (db_id, created_at, active, enabled) = match prev_id {
		Some(p) => p,
		None => {
			let mut rng = rand::thread_rng();
			let candidate = 100_000 + rng.gen_range(0..900_000);
			(candidate, now.clone(), true, true)
		}
	};

	conn.execute(
		"
		INSERT INTO stickers
			(db_id, name, category, file_name, width, height, active, enabled, created_at, updated_at)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
		ON CONFLICT(db_id) DO UPDATE SET
			name = excluded.name,
			category = excluded.category,
			file_name = excluded.file_name,
			width = excluded.width,
			height = excluded.height,
			active = excluded.active,
			enabled = excluded.enabled,
			updated_at = excluded.updated_at
		",
		params![
			db_id,
			label,
			category,
			stored_name,
			safe_w,
			safe_h,
			if active { 1 } else { 0 },
			if enabled { 1 } else { 0 },
			created_at,
			now,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let item = query_stickers(&conn).into_iter().find(|s| s.db_id == db_id);
	Ok(Json(json!({ "ok": true, "item": item })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StickerPutBody {
	pub db_id: Option<Value>,
	pub name: Option<String>,
	pub category: Option<String>,
	pub active: Option<bool>,
	pub enabled: Option<bool>,
}

pub async fn put_sticker(
	State(state): State<AppState>,
	Json(body): Json<StickerPutBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let Some(db_id) = body.db_id.as_ref().and_then(parse_i64) else {
		return Err(ok_err(StatusCode::BAD_REQUEST, "dbId diperlukan."));
	};

	let conn = state.conn()?;
	let existing = query_stickers(&conn).into_iter().find(|s| s.db_id == db_id);
	let Some(prev) = existing else {
		return Err(ok_err(
			StatusCode::NOT_FOUND,
			"Sticker custom tidak ditemukan.",
		));
	};

	let next_name: String = body
		.name
		.unwrap_or(prev.name)
		.chars()
		.take(80)
		.collect();
	let next_cat = body.category.unwrap_or(prev.category);
	let next_active = body.active.unwrap_or(prev.active);
	let next_enabled = body.enabled.unwrap_or(prev.enabled);
	let now = now_iso();

	conn.execute(
		"UPDATE stickers SET name = ?2, category = ?3, active = ?4, enabled = ?5, updated_at = ?6 WHERE db_id = ?1",
		params![
			db_id,
			next_name,
			next_cat,
			if next_active { 1 } else { 0 },
			if next_enabled { 1 } else { 0 },
			now,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let item = query_stickers(&conn).into_iter().find(|s| s.db_id == db_id);
	Ok(Json(json!({ "ok": true, "item": item })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StickerDeleteBody {
	pub db_id: Option<Value>,
}

pub async fn delete_sticker(
	State(state): State<AppState>,
	Json(body): Json<StickerDeleteBody>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
	let Some(db_id) = body.db_id.as_ref().and_then(parse_i64) else {
		return Err(ok_err(StatusCode::BAD_REQUEST, "dbId diperlukan."));
	};

	let conn = state.conn()?;
	let file_name: Option<String> = conn
		.query_row(
			"SELECT file_name FROM stickers WHERE db_id = ?1",
			params![db_id],
			|r| r.get(0),
		)
		.ok();

	let affected = conn
		.execute("DELETE FROM stickers WHERE db_id = ?1", params![db_id])
		.unwrap_or(0);
	if affected == 0 {
		return Ok((
			StatusCode::NOT_FOUND,
			Json(json!({ "ok": false, "error": "Tidak ditemukan." })),
		));
	}

	if let Some(fname) = file_name {
		if let Some(p) = resolve_safe_child(&state.stickers_dir, &fname) {
			let _ = fs::remove_file(p);
		}
	}
	Ok((StatusCode::OK, Json(json!({ "ok": true }))))
}

pub async fn get_sticker_file(
	State(state): State<AppState>,
	AxumPath(file): AxumPath<String>,
) -> Response {
	let Some(full) = resolve_safe_child(&state.stickers_dir, &file) else {
		return (StatusCode::BAD_REQUEST, "Invalid filename").into_response();
	};
	let Ok(bytes) = fs::read(&full) else {
		return (StatusCode::NOT_FOUND, "Not found").into_response();
	};
	binary_response(bytes, mime_for_path(&full), "public, max-age=3600")
}

// ─── Filters ────────────────────────────────────────────────────────────────

pub async fn get_filters(State(state): State<AppState>) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	Ok(Json(json!({ "ok": true, "items": query_filters(&conn) })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterPostBody {
	pub key: Option<String>,
	pub name: Option<String>,
	pub category: Option<String>,
	pub css_filter: Option<String>,
	pub ffmpeg: Option<String>,
	pub enabled: Option<bool>,
}

pub async fn post_filter(
	State(state): State<AppState>,
	Json(body): Json<FilterPostBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let name = body.name.as_deref().map(str::trim).unwrap_or("");
	if name.is_empty() {
		return Err(ok_err(StatusCode::BAD_REQUEST, "Nama filter diperlukan."));
	}

	let key_raw = body.key.as_deref().unwrap_or(name);
	let key = {
		let slug = slugify_id(key_raw);
		if slug.is_empty() { uid("filter", "-") } else { slug }
	};
	let now = now_iso();
	let conn = state.conn()?;

	let prev = query_filters(&conn).into_iter().find(|f| f.key == key);
	let created_at = prev.as_ref().map(|p| p.created_at.clone()).unwrap_or_else(|| now.clone());
	let clean_name: String = name.chars().take(80).collect();
	let category = body
		.category
		.filter(|c| !c.trim().is_empty())
		.or_else(|| prev.as_ref().map(|p| p.category.clone()))
		.unwrap_or_else(|| "Fun".to_string());
	let css_filter = body
		.css_filter
		.or_else(|| prev.as_ref().map(|p| p.css_filter.clone()))
		.unwrap_or_default();
	let ffmpeg = body
		.ffmpeg
		.or_else(|| prev.as_ref().map(|p| p.ffmpeg.clone()))
		.unwrap_or_default();
	let enabled = body.enabled.unwrap_or(true);

	conn.execute(
		"
		INSERT INTO filters (key, name, category, css_filter, ffmpeg, enabled, created_at, updated_at)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
		ON CONFLICT(key) DO UPDATE SET
			name = excluded.name,
			category = excluded.category,
			css_filter = excluded.css_filter,
			ffmpeg = excluded.ffmpeg,
			enabled = excluded.enabled,
			updated_at = excluded.updated_at
		",
		params![
			key,
			clean_name,
			category,
			css_filter,
			ffmpeg,
			if enabled { 1 } else { 0 },
			created_at,
			now,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let item = query_filters(&conn).into_iter().find(|f| f.key == key);
	Ok(Json(json!({ "ok": true, "item": item })))
}

pub async fn put_filter(
	State(state): State<AppState>,
	Json(body): Json<FilterPostBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let key = body.key.as_deref().map(str::trim).unwrap_or("");
	if key.is_empty() {
		return Err(ok_err(StatusCode::BAD_REQUEST, "key diperlukan."));
	}

	let conn = state.conn()?;
	let Some(prev) = query_filters(&conn).into_iter().find(|f| f.key == key) else {
		return Err(ok_err(
			StatusCode::NOT_FOUND,
			"Filter custom tidak ditemukan.",
		));
	};

	let next_name: String = body.name.unwrap_or(prev.name).chars().take(80).collect();
	let next_cat = body.category.unwrap_or(prev.category);
	let next_css = body.css_filter.unwrap_or(prev.css_filter);
	let next_ffmpeg = body.ffmpeg.unwrap_or(prev.ffmpeg);
	let next_enabled = body.enabled.unwrap_or(prev.enabled);
	let now = now_iso();

	conn.execute(
		"UPDATE filters SET name = ?2, category = ?3, css_filter = ?4, ffmpeg = ?5, enabled = ?6, updated_at = ?7 WHERE key = ?1",
		params![
			key,
			next_name,
			next_cat,
			next_css,
			next_ffmpeg,
			if next_enabled { 1 } else { 0 },
			now,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let item = query_filters(&conn).into_iter().find(|f| f.key == key);
	Ok(Json(json!({ "ok": true, "item": item })))
}

#[derive(Deserialize)]
pub struct FilterDeleteBody {
	pub key: Option<String>,
}

pub async fn delete_filter(
	State(state): State<AppState>,
	Json(body): Json<FilterDeleteBody>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
	let key = body.key.as_deref().map(str::trim).unwrap_or("");
	if key.is_empty() {
		return Err(ok_err(StatusCode::BAD_REQUEST, "key diperlukan."));
	}
	let conn = state.conn()?;
	let affected = conn
		.execute("DELETE FROM filters WHERE key = ?1", params![key])
		.unwrap_or(0);
	if affected == 0 {
		return Ok((
			StatusCode::NOT_FOUND,
			Json(json!({ "ok": false, "error": "Tidak ditemukan." })),
		));
	}
	Ok((StatusCode::OK, Json(json!({ "ok": true }))))
}

// ─── AR Assets ──────────────────────────────────────────────────────────────

pub async fn get_ar_assets(State(state): State<AppState>) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	Ok(Json(json!({ "ok": true, "items": query_ar(&conn) })))
}

pub async fn post_ar_asset(
	State(state): State<AppState>,
	mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let mut file_name: Option<String> = None;
	let mut file_mime: Option<String> = None;
	let mut file_bytes: Option<Vec<u8>> = None;
	let mut name_field: Option<String> = None;
	let mut width_val: i64 = 0;
	let mut height_val: i64 = 0;

	while let Ok(Some(field)) = multipart.next_field().await {
		let fname_attr = field.name().unwrap_or("").to_string();
		match fname_attr.as_str() {
			"file" => {
				file_name = field.file_name().map(str::to_string);
				file_mime = field.content_type().map(str::to_string);
				let bytes = field
					.bytes()
					.await
					.map_err(|e| ok_err(StatusCode::BAD_REQUEST, format!("Gagal baca file: {e}")))?;
				file_bytes = Some(bytes.to_vec());
			}
			"name" => {
				name_field = field.text().await.ok();
			}
			"width" => {
				if let Ok(t) = field.text().await {
					width_val = t.trim().parse::<f64>().unwrap_or(0.0).round() as i64;
				}
			}
			"height" => {
				if let Ok(t) = field.text().await {
					height_val = t.trim().parse::<f64>().unwrap_or(0.0).round() as i64;
				}
			}
			_ => {}
		}
	}

	let (Some(orig_name), Some(bytes)) = (file_name, file_bytes) else {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"File overlay AR diperlukan.",
		));
	};

	if !has_allowed_ext(&orig_name, &["png", "webp", "gif", "svg"]) {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"Format harus gambar transparan (PNG/WebP/GIF/SVG).",
		));
	}

	if bytes.len() > 6 * 1024 * 1024 {
		return Err(ok_err(
			StatusCode::PAYLOAD_TOO_LARGE,
			"Ukuran overlay maksimal 6 MB.",
		));
	}

	if width_val > 0 && height_val > 0 && (width_val.min(height_val) < 64 || width_val.max(height_val) < 100) {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			format!(
				"Resolusi overlay terlalu kecil ({width_val} × {height_val} px). Minimal 100 px (sisi terpendek ≥ 64 px)."
			),
		));
	}

	let stored_name = safe_filename(&orig_name);
	fs::write(state.ar_dir.join(&stored_name), &bytes)
		.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let default_name = orig_name
		.rsplit_once('.')
		.map(|(stem, _)| stem)
		.unwrap_or(&orig_name);
	let label: String = name_field
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or(default_name)
		.chars()
		.take(80)
		.collect();
	let mime = file_mime
		.filter(|m| !m.is_empty())
		.unwrap_or_else(|| mime_for_path(std::path::Path::new(&stored_name)).to_string());
	let w_opt = (width_val > 0 && height_val > 0).then(|| width_val.min(8000));
	let h_opt = (width_val > 0 && height_val > 0).then(|| height_val.min(8000));
	let now = now_iso();

	let conn = state.conn()?;
	let prev: Option<(String, String, bool)> = conn
		.query_row(
			"SELECT id, created_at, enabled FROM ar_assets WHERE file_name = ?1",
			params![stored_name],
			|r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0)),
		)
		.ok();

	let (id, created_at, enabled) = prev.unwrap_or_else(|| (uid("ar", "-"), now.clone(), true));

	conn.execute(
		"
		INSERT INTO ar_assets
			(id, name, file_name, mime_type, width, height, enabled, created_at, updated_at)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			file_name = excluded.file_name,
			mime_type = excluded.mime_type,
			width = COALESCE(excluded.width, ar_assets.width),
			height = COALESCE(excluded.height, ar_assets.height),
			enabled = excluded.enabled,
			updated_at = excluded.updated_at
		",
		params![
			id,
			label,
			stored_name,
			mime,
			w_opt,
			h_opt,
			if enabled { 1 } else { 0 },
			created_at,
			now,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let item = query_ar(&conn).into_iter().find(|a| a.id == id);
	Ok(Json(json!({ "ok": true, "item": item })))
}

#[derive(Deserialize)]
pub struct ArPutBody {
	pub id: Option<String>,
	pub name: Option<String>,
	pub enabled: Option<bool>,
}

pub async fn put_ar_asset(
	State(state): State<AppState>,
	Json(body): Json<ArPutBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let id = body.id.as_deref().map(str::trim).unwrap_or("");
	if id.is_empty() {
		return Err(ok_err(StatusCode::BAD_REQUEST, "id diperlukan."));
	}

	let conn = state.conn()?;
	let Some(prev) = query_ar(&conn).into_iter().find(|a| a.id == id) else {
		return Err(ok_err(StatusCode::NOT_FOUND, "Aset AR tidak ditemukan."));
	};

	let next_name: String = body.name.unwrap_or(prev.name).chars().take(80).collect();
	let next_enabled = body.enabled.unwrap_or(prev.enabled);
	let now = now_iso();

	conn.execute(
		"UPDATE ar_assets SET name = ?2, enabled = ?3, updated_at = ?4 WHERE id = ?1",
		params![id, next_name, if next_enabled { 1 } else { 0 }, now],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let item = query_ar(&conn).into_iter().find(|a| a.id == id);
	Ok(Json(json!({ "ok": true, "item": item })))
}

#[derive(Deserialize)]
pub struct ArDeleteBody {
	pub id: Option<String>,
}

pub async fn delete_ar_asset(
	State(state): State<AppState>,
	Json(body): Json<ArDeleteBody>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
	let id = body.id.as_deref().map(str::trim).unwrap_or("");
	if id.is_empty() {
		return Err(ok_err(StatusCode::BAD_REQUEST, "id diperlukan."));
	}

	let conn = state.conn()?;
	let file_name: Option<String> = conn
		.query_row(
			"SELECT file_name FROM ar_assets WHERE id = ?1",
			params![id],
			|r| r.get(0),
		)
		.ok();

	let affected = conn
		.execute("DELETE FROM ar_assets WHERE id = ?1", params![id])
		.unwrap_or(0);
	if affected == 0 {
		return Ok((
			StatusCode::NOT_FOUND,
			Json(json!({ "ok": false, "error": "Tidak ditemukan." })),
		));
	}

	if let Some(fname) = file_name {
		if let Some(p) = resolve_safe_child(&state.ar_dir, &fname) {
			let _ = fs::remove_file(p);
		}
	}
	Ok((StatusCode::OK, Json(json!({ "ok": true }))))
}

pub async fn get_ar_file(
	State(state): State<AppState>,
	AxumPath(file): AxumPath<String>,
) -> Response {
	let Some(full) = resolve_safe_child(&state.ar_dir, &file) else {
		return (StatusCode::BAD_REQUEST, "Invalid filename").into_response();
	};
	let Ok(bytes) = fs::read(&full) else {
		return (StatusCode::NOT_FOUND, "Not found").into_response();
	};
	binary_response(bytes, mime_for_path(&full), "public, max-age=3600")
}

// ─── Shared Query Helpers ───────────────────────────────────────────────────

pub fn query_stickers(conn: &Connection) -> Vec<CustomStickerDto> {
	let Ok(mut stmt) = conn.prepare(
		"
		SELECT db_id, name, category, file_name, width, height, active, enabled, created_at, updated_at
		FROM stickers
		ORDER BY updated_at DESC
		",
	) else {
		return Vec::new();
	};

	let Ok(rows) = stmt.query_map([], |r| {
		let file: String = r.get(3)?;
		Ok(CustomStickerDto {
			db_id: r.get(0)?,
			name: r.get(1)?,
			category: r.get(2)?,
			url: format!("/api/assets/stickers/{}", url_encode_segment(&file)),
			file,
			size: StickerSizeDto {
				w: r.get(4)?,
				h: r.get(5)?,
			},
			active: r.get::<_, i64>(6)? != 0,
			source: "custom",
			enabled: r.get::<_, i64>(7)? != 0,
			created_at: r.get(8)?,
			updated_at: r.get(9)?,
		})
	}) else {
		return Vec::new();
	};
	rows.filter_map(Result::ok).collect()
}

pub fn query_filters(conn: &Connection) -> Vec<CustomFilterDto> {
	let Ok(mut stmt) = conn.prepare(
		"
		SELECT key, name, category, css_filter, ffmpeg, enabled, created_at, updated_at
		FROM filters
		ORDER BY updated_at DESC
		",
	) else {
		return Vec::new();
	};

	let Ok(rows) = stmt.query_map([], |r| {
		Ok(CustomFilterDto {
			key: r.get(0)?,
			name: r.get(1)?,
			category: r.get(2)?,
			css_filter: r.get(3)?,
			ffmpeg: r.get(4)?,
			source: "custom",
			enabled: r.get::<_, i64>(5)? != 0,
			created_at: r.get(6)?,
			updated_at: r.get(7)?,
		})
	}) else {
		return Vec::new();
	};
	rows.filter_map(Result::ok).collect()
}

pub fn query_ar(conn: &Connection) -> Vec<CustomArDto> {
	let Ok(mut stmt) = conn.prepare(
		"
		SELECT id, name, file_name, mime_type, width, height, enabled, created_at, updated_at
		FROM ar_assets
		ORDER BY updated_at DESC
		",
	) else {
		return Vec::new();
	};

	let Ok(rows) = stmt.query_map([], |r| {
		let file: String = r.get(2)?;
		Ok(CustomArDto {
			id: r.get(0)?,
			name: r.get(1)?,
			url: format!("/api/assets/ar/{}", url_encode_segment(&file)),
			file,
			mime: r.get(3)?,
			width: r.get(4)?,
			height: r.get(5)?,
			enabled: r.get::<_, i64>(6)? != 0,
			created_at: r.get(7)?,
			updated_at: r.get(8)?,
		})
	}) else {
		return Vec::new();
	};
	rows.filter_map(Result::ok).collect()
}

fn has_allowed_ext(name: &str, allowed: &[&str]) -> bool {
	let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
	allowed.iter().any(|a| *a == ext)
}

fn parse_i64(val: &Value) -> Option<i64> {
	val.as_i64()
		.or_else(|| val.as_f64().filter(|n| n.is_finite()).map(|n| n.round() as i64))
		.or_else(|| val.as_str().and_then(|s| s.trim().parse::<i64>().ok()))
}
