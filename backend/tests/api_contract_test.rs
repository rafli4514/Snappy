use std::fs;
use std::path::PathBuf;

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use distudio_backend::db::seed::seed_demo_data;
use distudio_backend::routes::build_router;
use distudio_backend::{init_app_state, AppState, ServerConfig};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

const PNG_1X1: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

struct TempDir {
	dir: PathBuf,
}

impl TempDir {
	fn new(label: &str) -> Self {
		let unique = format!(
			"distudio-api-{}-{}-{}",
			label,
			std::process::id(),
			std::time::SystemTime::now()
				.duration_since(std::time::UNIX_EPOCH)
				.unwrap()
				.as_nanos()
		);
		let dir = std::env::temp_dir().join(unique);
		fs::create_dir_all(&dir).unwrap();
		Self { dir }
	}

	fn state(&self) -> AppState {
		init_app_state(&ServerConfig {
			host: "127.0.0.1".to_string(),
			port: 0,
			cache_dir: self.dir.clone(),
			static_dir: None,
		})
		.unwrap()
	}
}

impl Drop for TempDir {
	fn drop(&mut self) {
		let _ = fs::remove_dir_all(&self.dir);
	}
}

async fn send_json(app: &axum::Router, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
	let mut builder = Request::builder().method(method).uri(uri);
	let req_body = if let Some(b) = body {
		builder = builder.header(header::CONTENT_TYPE, "application/json");
		Body::from(b.to_string())
	} else {
		Body::empty()
	};
	let res = app.clone().oneshot(builder.body(req_body).unwrap()).await.unwrap();
	let status = res.status();
	let bytes = res.into_body().collect().await.unwrap().to_bytes();
	let val: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
	(status, val)
}

#[tokio::test]
async fn rejects_builtin_frame_size_mutations() {
	let ws = TempDir::new("builtin-lock");
	let app = build_router(ws.state());

	let payload = json!({
		"id": "2x6",
		"label": "Hack 2x6",
		"kind": "print",
		"pxW": 600,
		"pxH": 1800,
		"photos": [3, 4],
		"defaultCount": 4
	});

	let (st_post, v_post) = send_json(&app, "POST", "/api/frame-sizes", Some(payload.clone())).await;
	assert_eq!(st_post, StatusCode::BAD_REQUEST);
	assert_eq!(v_post["ok"], false);

	let (st_put, v_put) = send_json(&app, "PUT", "/api/frame-sizes", Some(payload)).await;
	assert_eq!(st_put, StatusCode::BAD_REQUEST);
	assert_eq!(v_put["ok"], false);

	let (st_del, v_del) = send_json(&app, "DELETE", "/api/frame-sizes", Some(json!({ "id": "2x6" }))).await;
	assert_eq!(st_del, StatusCode::BAD_REQUEST);
	assert_eq!(v_del["ok"], false);
}

#[tokio::test]
async fn filters_frames_strictly_by_format_slot_count_and_enabled() {
	let ws = TempDir::new("frame-filter");
	let state = ws.state();
	seed_demo_data(&state).unwrap();
	let app = build_router(state);

	// Disable the 4-slot 2x6 frame
	let (st, put_val) = send_json(
		&app,
		"PUT",
		"/api/assets/frames",
		Some(json!({ "id": "seed-frame-2x6-4", "enabled": false })),
	)
	.await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(put_val["item"]["enabled"], false);

	// Strict match: 2x6 + 3 slots + enabled -> only seed-frame-2x6-3
	let (st, res_3) = send_json(&app, "GET", "/api/assets/frames?formatId=2x6&slotCount=3&enabled=1", None).await;
	assert_eq!(st, StatusCode::OK);
	let items_3 = res_3["items"].as_array().unwrap();
	assert_eq!(items_3.len(), 1);
	assert_eq!(items_3[0]["id"], "seed-frame-2x6-3");

	// Disabled 4-slot must be excluded when enabled=1
	let (st, res_4) = send_json(&app, "GET", "/api/assets/frames?formatId=2x6&slotCount=4&enabled=1", None).await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(res_4["items"].as_array().unwrap().len(), 0);

	// Unrelated format must return 0
	let (st, res_other) = send_json(&app, "GET", "/api/assets/frames?formatId=4r-double&slotCount=3&enabled=1", None).await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(res_other["items"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn rejects_path_traversal_on_media_and_asset_routes() {
	let ws = TempDir::new("traversal");
	let state = ws.state();
	seed_demo_data(&state).unwrap();
	let app = build_router(state);

	for uri in [
		"/api/gallery/seed-sess-01/media/..%2F..%2Fdistudio.db",
		"/api/gallery/..%2Fevil/strip",
		"/api/assets/frames/..%2F..%2Fdistudio.db",
		"/api/assets/stickers/..%2F..%2Fdistudio.db",
		"/api/assets/ar/..%2F..%2Fdistudio.db",
	] {
		let res = app
			.clone()
			.oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
			.await
			.unwrap();
		assert!(
			res.status() == StatusCode::BAD_REQUEST || res.status() == StatusCode::NOT_FOUND,
			"expected 400 or 404 for traversal URI {uri}, got {}",
			res.status()
		);
	}
}

#[tokio::test]
async fn clamps_device_config_copies_and_ignores_invalid_modes() {
	let ws = TempDir::new("device-config");
	let app = build_router(ws.state());

	let (st, res1) = send_json(
		&app,
		"PUT",
		"/api/settings/device",
		Some(json!({
			"printMode": "direct",
			"printerName": "  Canon SELPHY  ",
			"layoutMode": "fill",
			"splitMode": "2-strip",
			"copies": 99,
			"autoRotate": false,
			"fallbackToBrowser": false
		})),
	)
	.await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(res1["config"]["printMode"], "direct");
	assert_eq!(res1["config"]["printerName"], "Canon SELPHY");
	assert_eq!(res1["config"]["layoutMode"], "fill");
	assert_eq!(res1["config"]["splitMode"], "2-strip");
	assert_eq!(res1["config"]["copies"], 10);
	assert_eq!(res1["config"]["autoRotate"], false);
	assert_eq!(res1["config"]["fallbackToBrowser"], false);

	// Invalid enum values must preserve previous valid values; copies=0 clamps to 1
	let (st, res2) = send_json(
		&app,
		"PUT",
		"/api/settings/device",
		Some(json!({
			"printMode": "invalid-mode",
			"layoutMode": "invalid-layout",
			"splitMode": "invalid-split",
			"copies": 0
		})),
	)
	.await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(res2["config"]["printMode"], "direct");
	assert_eq!(res2["config"]["layoutMode"], "fill");
	assert_eq!(res2["config"]["splitMode"], "2-strip");
	assert_eq!(res2["config"]["copies"], 1);
}

#[tokio::test]
async fn deleting_gallery_session_cascades_photos_and_removes_disk_folder() {
	let ws = TempDir::new("gallery-cascade");
	let state = ws.state();
	let app = build_router(state.clone());

	let (st, _) = send_json(
		&app,
		"POST",
		"/api/gallery",
		Some(json!({
			"id": "del-test-1",
			"photos": [PNG_1X1, PNG_1X1],
			"stripDataUrl": PNG_1X1,
			"templateKey": "classic",
			"formatId": "2x6"
		})),
	)
	.await;
	assert_eq!(st, StatusCode::OK);
	assert!(state.sessions_dir.join("del-test-1").join("strip.png").is_file());

	let photo_rows_before: i64 = state
		.conn()
		.unwrap()
		.query_row(
			"SELECT COUNT(*) FROM gallery_photos WHERE session_id = 'del-test-1'",
			[],
			|r| r.get(0),
		)
		.unwrap();
	assert_eq!(photo_rows_before, 2);

	let (st, del_val) = send_json(&app, "DELETE", "/api/gallery/del-test-1", None).await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(del_val["ok"], true);
	assert!(!state.sessions_dir.join("del-test-1").exists());

	let photo_rows_after: i64 = state
		.conn()
		.unwrap()
		.query_row(
			"SELECT COUNT(*) FROM gallery_photos WHERE session_id = 'del-test-1'",
			[],
			|r| r.get(0),
		)
		.unwrap();
	assert_eq!(photo_rows_after, 0);

	let (st, _) = send_json(&app, "GET", "/api/gallery/del-test-1", None).await;
	assert_eq!(st, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn rejects_invalid_queue_type_and_clears_by_type_only() {
	let ws = TempDir::new("queue-clear");
	let app = build_router(ws.state());

	let (st, err_val) = send_json(
		&app,
		"POST",
		"/api/queue",
		Some(json!({ "type": "unknown-type", "title": "Invalid" })),
	)
	.await;
	assert_eq!(st, StatusCode::BAD_REQUEST);
	assert_eq!(err_val["ok"], false);

	for (qtype, title) in [("print", "Print 1"), ("print", "Print 2"), ("upload", "Upload 1")] {
		let (st, _) = send_json(
			&app,
			"POST",
			"/api/queue",
			Some(json!({ "type": qtype, "status": "pending", "title": title })),
		)
		.await;
		assert_eq!(st, StatusCode::OK);
	}

	let (st, del_val) = send_json(&app, "DELETE", "/api/queue", Some(json!({ "type": "print" }))).await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(del_val["removed"], 2);
	assert_eq!(del_val["summary"]["print"]["total"], 0);
	assert_eq!(del_val["summary"]["upload"]["total"], 1);
}
