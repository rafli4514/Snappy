use std::collections::HashSet;
use std::fs;
use std::path::Path;

use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::Value;

use crate::state::{
	decode_data_url, ext_for_mime, is_safe_id, now_iso, safe_filename, AppState,
};

pub fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
	conn.execute_batch(
		"
		CREATE TABLE IF NOT EXISTS gallery_sessions (
			id TEXT PRIMARY KEY,
			format_id TEXT,
			template_key TEXT NOT NULL DEFAULT '',
			strip_path TEXT,
			gif_path TEXT,
			video_path TEXT,
			photo_count INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_gallery_sessions_created
			ON gallery_sessions(created_at DESC);

		CREATE TABLE IF NOT EXISTS gallery_photos (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL REFERENCES gallery_sessions(id) ON DELETE CASCADE,
			sort_order INTEGER NOT NULL,
			file_path TEXT NOT NULL,
			mime_type TEXT NOT NULL DEFAULT 'image/png',
			bytes INTEGER NOT NULL DEFAULT 0
		);

		CREATE INDEX IF NOT EXISTS idx_gallery_photos_session
			ON gallery_photos(session_id, sort_order);

		CREATE TABLE IF NOT EXISTS frame_sizes (
			id TEXT PRIMARY KEY,
			label TEXT NOT NULL,
			kind TEXT NOT NULL DEFAULT 'print',
			px_w INTEGER NOT NULL,
			px_h INTEGER NOT NULL,
			cm TEXT NOT NULL,
			photos_json TEXT NOT NULL,
			default_count INTEGER NOT NULL,
			thumbnail_path TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS frames (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			format_id TEXT,
			slot_count INTEGER NOT NULL,
			design_width INTEGER NOT NULL,
			design_height INTEGER NOT NULL,
			artwork_path TEXT NOT NULL,
			slots_json TEXT NOT NULL,
			focal TEXT NOT NULL DEFAULT 'center',
			source TEXT NOT NULL DEFAULT 'upload',
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_frames_format_slots
			ON frames(format_id, slot_count, enabled);

		CREATE TABLE IF NOT EXISTS stickers (
			db_id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			category TEXT NOT NULL DEFAULT 'Custom',
			file_name TEXT NOT NULL,
			width INTEGER NOT NULL DEFAULT 200,
			height INTEGER NOT NULL DEFAULT 200,
			active INTEGER NOT NULL DEFAULT 1,
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS filters (
			key TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			category TEXT NOT NULL DEFAULT 'Fun',
			css_filter TEXT NOT NULL DEFAULT '',
			ffmpeg TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS ar_assets (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			file_name TEXT NOT NULL,
			mime_type TEXT NOT NULL DEFAULT 'image/png',
			width INTEGER,
			height INTEGER,
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS queue_items (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			title TEXT NOT NULL,
			ref_id TEXT,
			detail TEXT,
			source TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_queue_type_created
			ON queue_items(type, created_at DESC);

		CREATE TABLE IF NOT EXISTS device_config (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			print_mode TEXT NOT NULL DEFAULT 'browser',
			printer_name TEXT NOT NULL DEFAULT '',
			layout_mode TEXT NOT NULL DEFAULT 'fit',
			split_mode TEXT NOT NULL DEFAULT 'none',
			auto_rotate INTEGER NOT NULL DEFAULT 1,
			copies INTEGER NOT NULL DEFAULT 1,
			fallback_to_browser INTEGER NOT NULL DEFAULT 1,
			updated_at TEXT NOT NULL DEFAULT ''
		);

		INSERT OR IGNORE INTO device_config (id) VALUES (1);

		CREATE TABLE IF NOT EXISTS cloud_config (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			client_id TEXT NOT NULL DEFAULT '',
			client_secret TEXT NOT NULL DEFAULT '',
			access_token TEXT NOT NULL DEFAULT '',
			refresh_token TEXT NOT NULL DEFAULT '',
			token_expires_at TEXT NOT NULL DEFAULT '',
			email TEXT NOT NULL DEFAULT '',
			needs_reconnect INTEGER NOT NULL DEFAULT 0,
			root_folder_id TEXT NOT NULL DEFAULT '',
			root_folder_name TEXT NOT NULL DEFAULT 'DISTUDIO Photobooth',
			auto_sync INTEGER NOT NULL DEFAULT 1,
			upload_strip INTEGER NOT NULL DEFAULT 1,
			upload_photos INTEGER NOT NULL DEFAULT 1,
			upload_gif INTEGER NOT NULL DEFAULT 1,
			upload_video INTEGER NOT NULL DEFAULT 1,
			public_share INTEGER NOT NULL DEFAULT 1,
			qr_mode TEXT NOT NULL DEFAULT 'smart',
			public_base_url TEXT NOT NULL DEFAULT '',
			last_sync_at TEXT NOT NULL DEFAULT '',
			updated_at TEXT NOT NULL DEFAULT ''
		);

		INSERT OR IGNORE INTO cloud_config (id) VALUES (1);

		CREATE TABLE IF NOT EXISTS cloud_session_sync (
			session_id TEXT PRIMARY KEY REFERENCES gallery_sessions(id) ON DELETE CASCADE,
			status TEXT NOT NULL DEFAULT 'pending',
			drive_folder_id TEXT NOT NULL DEFAULT '',
			drive_folder_url TEXT NOT NULL DEFAULT '',
			is_public INTEGER NOT NULL DEFAULT 0,
			total_files INTEGER NOT NULL DEFAULT 0,
			uploaded_files_json TEXT NOT NULL DEFAULT '{}',
			last_error TEXT NOT NULL DEFAULT '',
			updated_at TEXT NOT NULL DEFAULT ''
		);

		CREATE TABLE IF NOT EXISTS oauth_states (
			state TEXT PRIMARY KEY,
			redirect_uri TEXT NOT NULL,
			expires_at INTEGER NOT NULL
		);
		",
	)?;

	// Idempotent column migrations for pre-existing SQLite databases
	ensure_column_exists(
		conn,
		"cloud_config",
		"public_share",
		"INTEGER NOT NULL DEFAULT 1",
	)?;
	ensure_column_exists(
		conn,
		"cloud_config",
		"qr_mode",
		"TEXT NOT NULL DEFAULT 'smart'",
	)?;
	ensure_column_exists(
		conn,
		"cloud_config",
		"public_base_url",
		"TEXT NOT NULL DEFAULT ''",
	)?;
	ensure_column_exists(
		conn,
		"cloud_session_sync",
		"is_public",
		"INTEGER NOT NULL DEFAULT 0",
	)?;
	ensure_column_exists(
		conn,
		"cloud_session_sync",
		"total_files",
		"INTEGER NOT NULL DEFAULT 0",
	)?;

	Ok(())
}

fn ensure_column_exists(
	conn: &Connection,
	table: &str,
	column: &str,
	col_def: &str,
) -> rusqlite::Result<()> {
	let pragma_sql = format!("PRAGMA table_info({table})");
	let mut stmt = conn.prepare(&pragma_sql)?;
	let exists = stmt
		.query_map([], |row| row.get::<_, String>(1))?
		.filter_map(Result::ok)
		.any(|name| name.eq_ignore_ascii_case(column));
	if !exists {
		let alter_sql = format!("ALTER TABLE {table} ADD COLUMN {column} {col_def}");
		conn.execute(&alter_sql, [])?;
	}
	Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyDeviceConfig {
	print_mode: Option<String>,
	printer_name: Option<String>,
	layout_mode: Option<String>,
	split_mode: Option<String>,
	auto_rotate: Option<bool>,
	copies: Option<i64>,
	fallback_to_browser: Option<bool>,
	updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyQueueItem {
	id: String,
	#[serde(rename = "type")]
	item_type: String,
	status: Option<String>,
	title: Option<String>,
	#[serde(rename = "ref")]
	ref_id: Option<String>,
	detail: Option<String>,
	source: Option<String>,
	created_at: Option<String>,
	updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyFrameSize {
	id: String,
	label: Option<String>,
	kind: Option<String>,
	px_w: Option<i64>,
	px_h: Option<i64>,
	cm: Option<String>,
	photos: Option<Vec<i64>>,
	default_count: Option<i64>,
	thumbnail: Option<String>,
	created_at: Option<String>,
	updated_at: Option<String>,
}

#[derive(Deserialize)]
struct StickerSize {
	w: Option<i64>,
	h: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySticker {
	db_id: Option<i64>,
	name: Option<String>,
	category: Option<String>,
	file: Option<String>,
	size: Option<StickerSize>,
	active: Option<bool>,
	enabled: Option<bool>,
	created_at: Option<String>,
	updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyFilter {
	key: Option<String>,
	name: Option<String>,
	category: Option<String>,
	css_filter: Option<String>,
	ffmpeg: Option<String>,
	enabled: Option<bool>,
	created_at: Option<String>,
	updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyArAsset {
	id: Option<String>,
	name: Option<String>,
	file: Option<String>,
	mime: Option<String>,
	width: Option<i64>,
	height: Option<i64>,
	enabled: Option<bool>,
	created_at: Option<String>,
	updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GallerySessionPayload {
	pub id: Option<String>,
	pub created_at: Option<String>,
	pub photos: Option<Vec<Value>>,
	pub strip_data_url: Option<String>,
	pub template_key: Option<String>,
	pub format_id: Option<String>,
	pub gif_data_url: Option<String>,
	pub video_data_url: Option<String>,
}

pub fn migrate_legacy_cache(state: &AppState) {
	if let Err(e) = state.ensure_dirs() {
		eprintln!("[distudio] gagal menyiapkan direktori cache: {e}");
		return;
	}

	let Ok(mut conn) = state.conn() else {
		return;
	};

	migrate_device_config(&conn, &state.cache_dir);
	migrate_queue(&conn, &state.cache_dir);
	migrate_frame_sizes(&conn, state);
	migrate_stickers(&conn, &state.cache_dir);
	migrate_filters(&conn, &state.cache_dir);
	migrate_ar_assets(&conn, &state.cache_dir);
	migrate_sessions(&mut conn, state);
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
	if !path.is_file() {
		return None;
	}
	let raw = fs::read_to_string(path).ok()?;
	serde_json::from_str::<T>(&raw).ok()
}

fn migrate_device_config(conn: &Connection, cache_dir: &Path) {
	let current_updated: String = conn
		.query_row("SELECT updated_at FROM device_config WHERE id = 1", [], |r| {
			r.get(0)
		})
		.unwrap_or_default();
	if !current_updated.is_empty() {
		return;
	}
	let Some(cfg) = read_json_file::<LegacyDeviceConfig>(&cache_dir.join("_device_config.json"))
	else {
		return;
	};
	let _ = conn.execute(
		"
		UPDATE device_config SET
			print_mode = ?1,
			printer_name = ?2,
			layout_mode = ?3,
			split_mode = ?4,
			auto_rotate = ?5,
			copies = ?6,
			fallback_to_browser = ?7,
			updated_at = ?8
		WHERE id = 1
		",
		params![
			cfg.print_mode.unwrap_or_else(|| "browser".to_string()),
			cfg.printer_name.unwrap_or_default(),
			cfg.layout_mode.unwrap_or_else(|| "fit".to_string()),
			cfg.split_mode.unwrap_or_else(|| "none".to_string()),
			if cfg.auto_rotate.unwrap_or(true) { 1 } else { 0 },
			cfg.copies.unwrap_or(1).clamp(1, 10),
			if cfg.fallback_to_browser.unwrap_or(true) { 1 } else { 0 },
			cfg.updated_at.unwrap_or_else(now_iso),
		],
	);
}

fn migrate_queue(conn: &Connection, cache_dir: &Path) {
	let Some(items) = read_json_file::<Vec<LegacyQueueItem>>(&cache_dir.join("_queue.json")) else {
		return;
	};
	let now = now_iso();
	for item in items {
		if item.id.trim().is_empty() {
			continue;
		}
		let _ = conn.execute(
			"
			INSERT OR IGNORE INTO queue_items
				(id, type, status, title, ref_id, detail, source, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
			",
			params![
				item.id,
				item.item_type,
				item.status.unwrap_or_else(|| "pending".to_string()),
				item.title.unwrap_or_else(|| "Antrean".to_string()),
				item.ref_id,
				item.detail,
				item.source,
				item.created_at.unwrap_or_else(|| now.clone()),
				item.updated_at.unwrap_or_else(|| now.clone()),
			],
		);
	}
}

fn migrate_frame_sizes(conn: &Connection, state: &AppState) {
	let Some(items) =
		read_json_file::<Vec<LegacyFrameSize>>(&state.cache_dir.join("_custom_frame_sizes.json"))
	else {
		return;
	};
	let now = now_iso();
	for item in items {
		if item.id.trim().is_empty() {
			continue;
		}
		let mut thumb_path: Option<String> = None;
		if let Some(raw_thumb) = item.thumbnail.as_deref() {
			if let Some((mime, bytes)) = decode_data_url(raw_thumb) {
				let ext = ext_for_mime(&mime);
				let file_name = format!("{}.{}", safe_filename(&item.id), ext);
				if fs::write(state.thumbnails_dir.join(&file_name), bytes).is_ok() {
					thumb_path = Some(file_name);
				}
			}
		}
		let photos = item.photos.unwrap_or_else(|| vec![4]);
		let photos_json = serde_json::to_string(&photos).unwrap_or_else(|_| "[4]".to_string());
		let default_count = item
			.default_count
			.unwrap_or_else(|| *photos.first().unwrap_or(&4));
		let px_w = item.px_w.unwrap_or(600);
		let px_h = item.px_h.unwrap_or(1800);
		let _ = conn.execute(
			"
			INSERT OR IGNORE INTO frame_sizes
				(id, label, kind, px_w, px_h, cm, photos_json, default_count, thumbnail_path, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
			",
			params![
				item.id,
				item.label.unwrap_or_else(|| "Custom".to_string()),
				item.kind.unwrap_or_else(|| "print".to_string()),
				px_w,
				px_h,
				item.cm.unwrap_or_else(|| format!("{px_w}x{px_h}")),
				photos_json,
				default_count,
				thumb_path,
				item.created_at.unwrap_or_else(|| now.clone()),
				item.updated_at.unwrap_or_else(|| now.clone()),
			],
		);
	}
}

fn migrate_stickers(conn: &Connection, cache_dir: &Path) {
	let Some(items) =
		read_json_file::<Vec<LegacySticker>>(&cache_dir.join("_custom_stickers.json"))
	else {
		return;
	};
	let now = now_iso();
	for item in items {
		let (Some(db_id), Some(file)) = (item.db_id, item.file) else {
			continue;
		};
		let w = item.size.as_ref().and_then(|s| s.w).unwrap_or(200);
		let h = item.size.as_ref().and_then(|s| s.h).unwrap_or(200);
		let _ = conn.execute(
			"
			INSERT OR IGNORE INTO stickers
				(db_id, name, category, file_name, width, height, active, enabled, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
			",
			params![
				db_id,
				item.name.unwrap_or_else(|| file.clone()),
				item.category.unwrap_or_else(|| "Custom".to_string()),
				safe_filename(&file),
				w,
				h,
				if item.active.unwrap_or(true) { 1 } else { 0 },
				if item.enabled.unwrap_or(true) { 1 } else { 0 },
				item.created_at.unwrap_or_else(|| now.clone()),
				item.updated_at.unwrap_or_else(|| now.clone()),
			],
		);
	}
}

fn migrate_filters(conn: &Connection, cache_dir: &Path) {
	let Some(items) = read_json_file::<Vec<LegacyFilter>>(&cache_dir.join("_custom_filters.json"))
	else {
		return;
	};
	let now = now_iso();
	for item in items {
		let Some(key) = item.key.filter(|k| !k.trim().is_empty()) else {
			continue;
		};
		let _ = conn.execute(
			"
			INSERT OR IGNORE INTO filters
				(key, name, category, css_filter, ffmpeg, enabled, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
			",
			params![
				key,
				item.name.unwrap_or_else(|| "Filter".to_string()),
				item.category.unwrap_or_else(|| "Fun".to_string()),
				item.css_filter.unwrap_or_default(),
				item.ffmpeg.unwrap_or_default(),
				if item.enabled.unwrap_or(true) { 1 } else { 0 },
				item.created_at.unwrap_or_else(|| now.clone()),
				item.updated_at.unwrap_or_else(|| now.clone()),
			],
		);
	}
}

fn migrate_ar_assets(conn: &Connection, cache_dir: &Path) {
	let Some(items) = read_json_file::<Vec<LegacyArAsset>>(&cache_dir.join("_custom_ar.json"))
	else {
		return;
	};
	let now = now_iso();
	for item in items {
		let (Some(id), Some(file)) = (item.id, item.file) else {
			continue;
		};
		let _ = conn.execute(
			"
			INSERT OR IGNORE INTO ar_assets
				(id, name, file_name, mime_type, width, height, enabled, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
			",
			params![
				id,
				item.name.unwrap_or_else(|| file.clone()),
				safe_filename(&file),
				item.mime.unwrap_or_else(|| "image/png".to_string()),
				item.width,
				item.height,
				if item.enabled.unwrap_or(true) { 1 } else { 0 },
				item.created_at.unwrap_or_else(|| now.clone()),
				item.updated_at.unwrap_or_else(|| now.clone()),
			],
		);
	}
}

fn migrate_sessions(conn: &mut Connection, state: &AppState) {
	let mut existing_ids: HashSet<String> = HashSet::new();
	if let Ok(mut stmt) = conn.prepare("SELECT id FROM gallery_sessions") {
		if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
			for row in rows.flatten() {
				existing_ids.insert(row);
			}
		}
	}

	let Ok(entries) = fs::read_dir(&state.cache_dir) else {
		return;
	};

	let mut migrated = 0usize;
	for entry in entries.flatten() {
		let path = entry.path();
		if !path.is_file() {
			continue;
		}
		let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
			continue;
		};
		if name.starts_with('_') || !name.to_ascii_lowercase().ends_with(".json") {
			continue;
		}
		let stem = &name[..name.len() - 5];
		if !is_safe_id(stem) || existing_ids.contains(stem) {
			continue;
		}

		let Some(payload) = read_json_file::<GallerySessionPayload>(&path) else {
			continue;
		};
		let session_id = payload
			.id
			.as_deref()
			.filter(|id| is_safe_id(id))
			.unwrap_or(stem)
			.to_string();
		if existing_ids.contains(&session_id) {
			continue;
		}

		if persist_gallery_session(conn, state, &session_id, &payload).is_ok() {
			existing_ids.insert(session_id);
			migrated += 1;
		}
	}

	if migrated > 0 {
		println!("[distudio] migrasi otomatis {migrated} sesi galeri lama ke SQLite + file biner selesai.");
	}
}

pub fn persist_gallery_session(
	conn: &mut Connection,
	state: &AppState,
	session_id: &str,
	payload: &GallerySessionPayload,
) -> Result<(), String> {
	let session_dir = state.sessions_dir.join(session_id);
	fs::create_dir_all(&session_dir).map_err(|e| format!("gagal buat folder sesi: {e}"))?;

	let existing_paths: Option<(Option<String>, Option<String>, Option<String>)> = conn
		.query_row(
			"SELECT strip_path, gif_path, video_path FROM gallery_sessions WHERE id = ?1",
			params![session_id],
			|r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
		)
		.ok();

	let existing_photos: Vec<(String, String, i64)> = conn
		.prepare("SELECT file_path, mime_type, bytes FROM gallery_photos WHERE session_id = ?1 ORDER BY sort_order ASC")
		.and_then(|mut s| {
			s.query_map(params![session_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
				.map(|iter| iter.filter_map(Result::ok).collect())
		})
		.unwrap_or_default();

	let strip_path = if let Some(raw) = payload.strip_data_url.as_deref().filter(|s| !s.is_empty()) {
		if let Some((mime, bytes)) = decode_data_url(raw) {
			let fname = format!("strip.{}", ext_for_mime(&mime));
			fs::write(session_dir.join(&fname), bytes)
				.map_err(|e| format!("gagal simpan strip: {e}"))?;
			Some(fname)
		} else {
			existing_paths.as_ref().and_then(|p| p.0.clone())
		}
	} else {
		None
	};

	let gif_path = if let Some(raw) = payload.gif_data_url.as_deref().filter(|s| !s.is_empty()) {
		if let Some((_mime, bytes)) = decode_data_url(raw) {
			let fname = "timelapse.gif".to_string();
			fs::write(session_dir.join(&fname), bytes)
				.map_err(|e| format!("gagal simpan gif: {e}"))?;
			Some(fname)
		} else {
			existing_paths.as_ref().and_then(|p| p.1.clone())
		}
	} else {
		None
	};

	let video_path = if let Some(raw) = payload.video_data_url.as_deref().filter(|s| !s.is_empty()) {
		if let Some((mime, bytes)) = decode_data_url(raw) {
			let fname = format!("timelapse.{}", ext_for_mime(&mime));
			fs::write(session_dir.join(&fname), bytes)
				.map_err(|e| format!("gagal simpan video: {e}"))?;
			Some(fname)
		} else {
			existing_paths.as_ref().and_then(|p| p.2.clone())
		}
	} else {
		None
	};

	let mut photo_records: Vec<(i64, String, String, i64)> = Vec::new();
	if let Some(raw_photos) = payload.photos.as_ref() {
		for (idx, val) in raw_photos.iter().enumerate() {
			let Some(raw_str) = val.as_str().filter(|s| !s.is_empty()) else {
				continue;
			};
			if let Some((mime, bytes)) = decode_data_url(raw_str) {
				let fname = format!("photo-{idx}.{}", ext_for_mime(&mime));
				let byte_len = bytes.len() as i64;
				fs::write(session_dir.join(&fname), bytes)
					.map_err(|e| format!("gagal simpan foto {idx}: {e}"))?;
				photo_records.push((idx as i64, fname, mime, byte_len));
			} else if let Some(file_part) = extract_media_filename(raw_str, session_id) {
				if let Some((_, mime, byte_len)) =
					existing_photos.iter().find(|(fp, _, _)| fp == &file_part)
				{
					photo_records.push((idx as i64, file_part, mime.clone(), *byte_len));
				}
			}
		}
	}

	let created_at = payload
		.created_at
		.as_deref()
		.filter(|s| !s.trim().is_empty())
		.map(str::to_string)
		.unwrap_or_else(now_iso);
	let template_key = payload
		.template_key
		.as_deref()
		.unwrap_or("")
		.to_string();
	let format_id = payload
		.format_id
		.as_deref()
		.filter(|s| !s.trim().is_empty())
		.map(str::to_string);
	let photo_count = photo_records.len() as i64;

	let tx = conn
		.transaction()
		.map_err(|e| format!("gagal mulai transaksi sqlite: {e}"))?;

	tx.execute(
		"
		INSERT INTO gallery_sessions
			(id, format_id, template_key, strip_path, gif_path, video_path, photo_count, created_at)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
		ON CONFLICT(id) DO UPDATE SET
			format_id = excluded.format_id,
			template_key = excluded.template_key,
			strip_path = excluded.strip_path,
			gif_path = excluded.gif_path,
			video_path = excluded.video_path,
			photo_count = excluded.photo_count
		",
		params![
			session_id,
			format_id,
			template_key,
			strip_path,
			gif_path,
			video_path,
			photo_count,
			created_at,
		],
	)
	.map_err(|e| format!("gagal simpan gallery_sessions: {e}"))?;

	tx.execute(
		"DELETE FROM gallery_photos WHERE session_id = ?1",
		params![session_id],
	)
	.map_err(|e| format!("gagal reset gallery_photos: {e}"))?;

	for (order, fname, mime, byte_len) in photo_records {
		tx.execute(
			"
			INSERT INTO gallery_photos (session_id, sort_order, file_path, mime_type, bytes)
			VALUES (?1, ?2, ?3, ?4, ?5)
			",
			params![session_id, order, fname, mime, byte_len],
		)
		.map_err(|e| format!("gagal simpan gallery_photos: {e}"))?;
	}

	tx.commit()
		.map_err(|e| format!("gagal commit sqlite: {e}"))?;
	Ok(())
}

fn extract_media_filename(url_or_path: &str, session_id: &str) -> Option<String> {
	let prefix = format!("/api/gallery/{session_id}/media/");
	url_or_path
		.strip_prefix(&prefix)
		.map(|rest| rest.split('?').next().unwrap_or(rest).to_string())
		.filter(|s| !s.is_empty())
}
