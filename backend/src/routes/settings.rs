use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::state::{now_iso, ok_err, AppState};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PrintDeviceConfigDto {
	pub print_mode: String,
	pub printer_name: String,
	pub layout_mode: String,
	pub split_mode: String,
	pub auto_rotate: bool,
	pub copies: i64,
	pub fallback_to_browser: bool,
	pub updated_at: String,
}

impl Default for PrintDeviceConfigDto {
	fn default() -> Self {
		Self {
			print_mode: "browser".to_string(),
			printer_name: String::new(),
			layout_mode: "fit".to_string(),
			split_mode: "none".to_string(),
			auto_rotate: true,
			copies: 1,
			fallback_to_browser: true,
			updated_at: String::new(),
		}
	}
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintDevicePatch {
	pub print_mode: Option<String>,
	pub printer_name: Option<String>,
	pub layout_mode: Option<String>,
	pub split_mode: Option<String>,
	pub auto_rotate: Option<bool>,
	pub copies: Option<Value>,
	pub fallback_to_browser: Option<bool>,
}

pub async fn get_device_settings(
	State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	let config = load_device_config(&conn);
	Ok(Json(json!({ "ok": true, "config": config })))
}

pub async fn put_device_settings(
	State(state): State<AppState>,
	Json(patch): Json<PrintDevicePatch>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
	let conn = state.conn()?;
	let prev = load_device_config(&conn);

	let print_mode = match patch.print_mode.as_deref() {
		Some("direct") => "direct".to_string(),
		Some("browser") => "browser".to_string(),
		_ => prev.print_mode,
	};
	let layout_mode = match patch.layout_mode.as_deref() {
		Some("fit") => "fit".to_string(),
		Some("fill") => "fill".to_string(),
		Some("stretch") => "stretch".to_string(),
		_ => prev.layout_mode,
	};
	let split_mode = match patch.split_mode.as_deref() {
		Some("none") => "none".to_string(),
		Some("2-strip") => "2-strip".to_string(),
		_ => prev.split_mode,
	};
	let printer_name = match patch.printer_name.as_deref() {
		Some(s) => s.trim().chars().take(140).collect(),
		None => prev.printer_name,
	};
	let copies = patch
		.copies
		.as_ref()
		.and_then(|v| {
			v.as_i64()
				.or_else(|| v.as_f64().filter(|n| n.is_finite()).map(|n| n.round() as i64))
		})
		.map(|n| n.clamp(1, 10))
		.unwrap_or(prev.copies);
	let auto_rotate = patch.auto_rotate.unwrap_or(prev.auto_rotate);
	let fallback_to_browser = patch
		.fallback_to_browser
		.unwrap_or(prev.fallback_to_browser);
	let updated_at = now_iso();

	conn.execute(
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
			print_mode,
			printer_name,
			layout_mode,
			split_mode,
			if auto_rotate { 1 } else { 0 },
			copies,
			if fallback_to_browser { 1 } else { 0 },
			updated_at,
		],
	)
	.map_err(|e| ok_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

	let config = load_device_config(&conn);
	Ok(Json(json!({ "ok": true, "config": config })))
}

pub fn load_device_config(conn: &Connection) -> PrintDeviceConfigDto {
	conn.query_row(
		"
		SELECT print_mode, printer_name, layout_mode, split_mode,
			   auto_rotate, copies, fallback_to_browser, updated_at
		FROM device_config WHERE id = 1
		",
		[],
		|r| {
			Ok(PrintDeviceConfigDto {
				print_mode: r.get(0)?,
				printer_name: r.get(1)?,
				layout_mode: r.get(2)?,
				split_mode: r.get(3)?,
				auto_rotate: r.get::<_, i64>(4)? != 0,
				copies: r.get::<_, i64>(5)?.clamp(1, 10),
				fallback_to_browser: r.get::<_, i64>(6)? != 0,
				updated_at: r.get(7)?,
			})
		},
	)
	.unwrap_or_default()
}
