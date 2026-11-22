use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::routes::assets::{query_ar, query_filters, query_stickers};
use crate::state::{now_iso, ok_err, uid, AppState};

const TYPES: &[&str] = &["cloud-sync", "print", "upload"];
const STATUSES: &[&str] = &["pending", "processing", "done", "failed", "skipped"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueItemDto {
	pub id: String,
	#[serde(rename = "type")]
	pub item_type: String,
	pub status: String,
	pub title: String,
	#[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
	pub ref_id: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub detail: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub source: Option<String>,
	pub created_at: String,
	pub updated_at: String,
}

#[derive(Deserialize)]
pub struct QueueQuery {
	#[serde(rename = "type")]
	pub item_type: Option<String>,
	pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct QueuePostBody {
	#[serde(rename = "type")]
	pub item_type: Option<Value>,
	pub status: Option<Value>,
	pub title: Option<Value>,
	#[serde(rename = "ref")]
	pub ref_id: Option<Value>,
	pub detail: Option<Value>,
	pub source: Option<Value>,
}

#[derive(Deserialize)]
pub struct QueuePatchBody {
	pub id: Option<Value>,
	pub status: Option<Value>,
	pub detail: Option<Value>,
	pub title: Option<Value>,
}

#[derive(Deserialize)]
pub struct QueueDeleteBody {
	pub id: Option<String>,
	#[serde(rename = "type")]
	pub item_type: Option<String>,
	pub all: Option<bool>,
}

pub async fn get_queue(
	State(state): State<AppState>,
	Query(q): Query<QueueQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let filter_type = q
		.item_type
		.as_deref()
		.filter(|t| TYPES.contains(t))
		.map(str::to_string);
	let limit = q.limit.unwrap_or(80).clamp(1, 200);

	let conn = state.conn()?;
	let mut items = list_queue_rows(&conn, filter_type.as_deref());
	items.truncate(limit as usize);

	let gallery_sessions: i64 = conn
		.query_row("SELECT COUNT(*) FROM gallery_sessions", [], |r| r.get(0))
		.unwrap_or(0);
	let custom_assets = (query_stickers(&conn).len()
		+ query_filters(&conn).len()
		+ query_ar(&conn).len()) as i64;

	let summary = summarize_queue(&conn);
	Ok(Json(json!({
		"ok": true,
		"items": items,
		"summary": summary,
		"context": {
			"gallerySessions": gallery_sessions,
			"customAssets": custom_assets
		}
	})))
}

pub async fn post_queue(
	State(state): State<AppState>,
	Json(body): Json<QueuePostBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let Some(item_type) = body
		.item_type
		.as_ref()
		.and_then(|v| v.as_str())
		.filter(|t| TYPES.contains(t))
	else {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"Tipe antrian tidak valid.",
		));
	};

	let status = body
		.status
		.as_ref()
		.and_then(|v| v.as_str())
		.filter(|s| STATUSES.contains(s))
		.unwrap_or("pending");
	let title = body
		.title
		.as_ref()
		.and_then(|v| v.as_str())
		.unwrap_or(item_type);
	let ref_id = body.ref_id.as_ref().and_then(|v| v.as_str());
	let detail = body.detail.as_ref().and_then(|v| v.as_str());
	let source = body
		.source
		.as_ref()
		.and_then(|v| v.as_str())
		.unwrap_or("dashboard");

	let conn = state.conn()?;
	let item = enqueue_row(&conn, item_type, status, title, ref_id, detail, Some(source))
		.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let summary = summarize_queue(&conn);
	Ok(Json(json!({ "ok": true, "item": item, "summary": summary })))
}

pub async fn patch_queue(
	State(state): State<AppState>,
	Json(body): Json<QueuePatchBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let id = body
		.id
		.as_ref()
		.and_then(|v| v.as_str())
		.map(str::trim)
		.unwrap_or("");
	if id.is_empty() {
		return Err(ok_err(StatusCode::BAD_REQUEST, "id diperlukan."));
	}

	let conn = state.conn()?;
	let Some(prev) = list_queue_rows(&conn, None).into_iter().find(|x| x.id == id) else {
		return Err(ok_err(StatusCode::NOT_FOUND, "Item tidak ditemukan."));
	};

	let next_status = body
		.status
		.as_ref()
		.and_then(|v| v.as_str())
		.filter(|s| STATUSES.contains(s))
		.map(str::to_string)
		.unwrap_or(prev.status);
	let next_detail = match body.detail.as_ref().and_then(|v| v.as_str()) {
		Some(d) => Some(d.chars().take(500).collect()),
		None => prev.detail,
	};
	let next_title = match body.title.as_ref().and_then(|v| v.as_str()) {
		Some(t) => t.chars().take(140).collect(),
		None => prev.title,
	};
	let now = now_iso();

	conn.execute(
		"UPDATE queue_items SET status = ?2, detail = ?3, title = ?4, updated_at = ?5 WHERE id = ?1",
		params![id, next_status, next_detail, next_title, now],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let item = list_queue_rows(&conn, None).into_iter().find(|x| x.id == id);
	let summary = summarize_queue(&conn);
	Ok(Json(json!({ "ok": true, "item": item, "summary": summary })))
}

pub async fn delete_queue(
	State(state): State<AppState>,
	Json(body): Json<QueueDeleteBody>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	if let Some(id) = body.id.as_deref().filter(|s| !s.is_empty()) {
		let affected = conn
			.execute("DELETE FROM queue_items WHERE id = ?1", params![id])
			.unwrap_or(0);
		let ok = affected > 0;
		let summary = summarize_queue(&conn);
		return Ok((
			if ok { StatusCode::OK } else { StatusCode::NOT_FOUND },
			Json(json!({ "ok": ok, "summary": summary })),
		));
	}

	let clear_all = body.all.unwrap_or(false);
	let target_type = body.item_type.as_deref().filter(|t| TYPES.contains(t));
	if !clear_all && target_type.is_none() {
		return Err(ok_err(
			StatusCode::BAD_REQUEST,
			"id atau type/all diperlukan.",
		));
	}

	let removed = if clear_all {
		conn.execute("DELETE FROM queue_items", []).unwrap_or(0)
	} else if let Some(t) = target_type {
		conn.execute("DELETE FROM queue_items WHERE type = ?1", params![t])
			.unwrap_or(0)
	} else {
		0
	};

	let summary = summarize_queue(&conn);
	Ok((
		StatusCode::OK,
		Json(json!({ "ok": true, "removed": removed, "summary": summary })),
	))
}

pub fn enqueue_row(
	conn: &Connection,
	item_type: &str,
	status: &str,
	title: &str,
	ref_id: Option<&str>,
	detail: Option<&str>,
	source: Option<&str>,
) -> rusqlite::Result<QueueItemDto> {
	let id = uid("q", "_");
	let now = now_iso();
	let clean_title: String = if title.is_empty() {
		item_type.to_string()
	} else {
		title.chars().take(140).collect()
	};
	let clean_ref = ref_id.map(|s| s.chars().take(200).collect::<String>());
	let clean_detail = detail.map(|s| s.chars().take(500).collect::<String>());
	let clean_source = source.map(|s| s.chars().take(80).collect::<String>());

	conn.execute(
		"
		INSERT INTO queue_items
			(id, type, status, title, ref_id, detail, source, created_at, updated_at)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
		",
		params![
			id,
			item_type,
			status,
			clean_title,
			clean_ref,
			clean_detail,
			clean_source,
			now,
			now,
		],
	)?;

	let _ = conn.execute(
		"
		DELETE FROM queue_items
		WHERE id NOT IN (
			SELECT id FROM queue_items ORDER BY created_at DESC LIMIT 500
		)
		",
		[],
	);

	Ok(QueueItemDto {
		id,
		item_type: item_type.to_string(),
		status: status.to_string(),
		title: clean_title,
		ref_id: clean_ref,
		detail: clean_detail,
		source: clean_source,
		created_at: now.clone(),
		updated_at: now,
	})
}

fn list_queue_rows(conn: &Connection, filter_type: Option<&str>) -> Vec<QueueItemDto> {
	let sql = if filter_type.is_some() {
		"SELECT id, type, status, title, ref_id, detail, source, created_at, updated_at FROM queue_items WHERE type = ?1 ORDER BY created_at DESC"
	} else {
		"SELECT id, type, status, title, ref_id, detail, source, created_at, updated_at FROM queue_items ORDER BY created_at DESC"
	};

	let Ok(mut stmt) = conn.prepare(sql) else {
		return Vec::new();
	};

	let map_fn = |r: &rusqlite::Row<'_>| -> rusqlite::Result<QueueItemDto> {
		Ok(QueueItemDto {
			id: r.get(0)?,
			item_type: r.get(1)?,
			status: r.get(2)?,
			title: r.get(3)?,
			ref_id: r.get(4)?,
			detail: r.get(5)?,
			source: r.get(6)?,
			created_at: r.get(7)?,
			updated_at: r.get(8)?,
		})
	};

	if let Some(t) = filter_type {
		stmt.query_map(params![t], map_fn)
			.map(|rows| rows.filter_map(Result::ok).collect())
			.unwrap_or_default()
	} else {
		stmt.query_map([], map_fn)
			.map(|rows| rows.filter_map(Result::ok).collect())
			.unwrap_or_default()
	}
}

fn summarize_queue(conn: &Connection) -> Value {
	let mut map = serde_json::Map::new();
	for t in TYPES {
		map.insert(
			(*t).to_string(),
			json!({ "total": 0, "pending": 0, "failed": 0, "done": 0 }),
		);
	}
	for item in list_queue_rows(conn, None) {
		if let Some(entry) = map.get_mut(&item.item_type).and_then(|v| v.as_object_mut()) {
			let bump = |obj: &mut serde_json::Map<String, Value>, k: &str| {
				let cur = obj.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
				obj.insert(k.to_string(), json!(cur + 1));
			};
			bump(entry, "total");
			if item.status == "pending" || item.status == "processing" {
				bump(entry, "pending");
			} else if item.status == "failed" {
				bump(entry, "failed");
			} else if item.status == "done" {
				bump(entry, "done");
			}
		}
	}
	Value::Object(map)
}
