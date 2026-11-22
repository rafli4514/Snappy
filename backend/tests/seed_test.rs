use std::fs;
use std::path::PathBuf;

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use distudio_backend::db::seed::{clear_seed_data, seed_demo_data};
use distudio_backend::routes::build_router;
use distudio_backend::{init_app_state, parse_cli_args, AppState, CliAction, ServerConfig};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

const PNG_MAGIC: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

struct TempWorkspace {
	dir: PathBuf,
}

impl TempWorkspace {
	fn new(label: &str) -> Self {
		let unique = format!(
			"distudio-test-{}-{}-{}",
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

	fn app_state(&self) -> AppState {
		let cfg = ServerConfig {
			host: "127.0.0.1".to_string(),
			port: 0,
			cache_dir: self.dir.clone(),
			static_dir: None,
		};
		init_app_state(&cfg).expect("init_app_state must succeed")
	}
}

impl Drop for TempWorkspace {
	fn drop(&mut self) {
		let _ = fs::remove_dir_all(&self.dir);
	}
}

async fn get_json(app: &axum::Router, uri: &str) -> (StatusCode, Value) {
	let res = app
		.clone()
		.oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
		.await
		.unwrap();
	let status = res.status();
	let bytes = res.into_body().collect().await.unwrap().to_bytes();
	let json: Value = serde_json::from_slice(&bytes).expect("response must be valid JSON");
	(status, json)
}

async fn get_bytes(app: &axum::Router, uri: &str) -> (StatusCode, Option<String>, Vec<u8>) {
	let res = app
		.clone()
		.oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
		.await
		.unwrap();
	let status = res.status();
	let ct = res
		.headers()
		.get(header::CONTENT_TYPE)
		.and_then(|v| v.to_str().ok())
		.map(str::to_string);
	let bytes = res.into_body().collect().await.unwrap().to_bytes().to_vec();
	(status, ct, bytes)
}

#[tokio::test]
async fn seed_populates_all_tables_and_serves_valid_png_assets() {
	let ws = TempWorkspace::new("seed-populate");
	let state = ws.app_state();

	let report = seed_demo_data(&state).expect("seed_demo_data should succeed");
	assert_eq!(report.sessions, 3);
	assert_eq!(report.frames, 2);
	assert_eq!(report.stickers, 2);
	assert_eq!(report.filters, 2);
	assert_eq!(report.ar_assets, 1);
	assert_eq!(report.frame_sizes, 1);
	assert_eq!(report.queue_items, 4);

	let app = build_router(state);

	// 1. Gallery listing & streaming PNGs (including HTTP Range 206)
	let (st, list_json) = get_json(&app, "/api/gallery?list=1&limit=20").await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(list_json["sessions"].as_array().unwrap().len(), 3);

	let (st, detail) = get_json(&app, "/api/gallery/seed-sess-01").await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(detail["stripDataUrl"], "/api/gallery/seed-sess-01/strip");
	let photos = detail["photos"].as_array().unwrap();
	assert_eq!(photos.len(), 3);

	let (st, ct, strip_bytes) = get_bytes(&app, "/api/gallery/seed-sess-01/strip").await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(ct.as_deref(), Some("image/png"));
	assert!(strip_bytes.starts_with(PNG_MAGIC), "strip must be valid PNG");

	let photo_url = photos[0].as_str().unwrap();
	let range_res = app
		.clone()
		.oneshot(
			Request::builder()
				.uri(photo_url)
				.header(header::RANGE, "bytes=0-7")
				.body(Body::empty())
				.unwrap(),
		)
		.await
		.unwrap();
	assert_eq!(range_res.status(), StatusCode::PARTIAL_CONTENT);
	let range_bytes = range_res.into_body().collect().await.unwrap().to_bytes();
	assert_eq!(&range_bytes[..], PNG_MAGIC);

	// 2. Frames & artwork binary PNG
	let (st, frames_json) = get_json(&app, "/api/assets/frames").await;
	assert_eq!(st, StatusCode::OK);
	let frames = frames_json["items"].as_array().unwrap();
	assert_eq!(frames.len(), 2);
	let art_url = frames[0]["artworkDataUrl"].as_str().unwrap();
	let (st, ct, art_bytes) = get_bytes(&app, art_url).await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(ct.as_deref(), Some("image/png"));
	assert!(art_bytes.starts_with(PNG_MAGIC), "frame artwork must be valid PNG");

	// 3. Stickers, filters, AR overlay & binary PNGs
	let (st, assets_json) = get_json(&app, "/api/assets").await;
	assert_eq!(st, StatusCode::OK);
	let stickers = assets_json["stickers"].as_array().unwrap();
	let filters = assets_json["filters"].as_array().unwrap();
	let ar = assets_json["ar"].as_array().unwrap();
	assert_eq!(stickers.len(), 2);
	assert_eq!(filters.len(), 2);
	assert_eq!(ar.len(), 1);

	let (st, _, stk_bytes) = get_bytes(&app, stickers[0]["url"].as_str().unwrap()).await;
	assert_eq!(st, StatusCode::OK);
	assert!(stk_bytes.starts_with(PNG_MAGIC), "sticker must be valid PNG");

	let (st, _, ar_bytes) = get_bytes(&app, ar[0]["url"].as_str().unwrap()).await;
	assert_eq!(st, StatusCode::OK);
	assert!(ar_bytes.starts_with(PNG_MAGIC), "AR overlay must be valid PNG");

	// 4. Custom frame size & thumbnail binary PNG
	let (st, sizes_json) = get_json(&app, "/api/frame-sizes").await;
	assert_eq!(st, StatusCode::OK);
	let sizes = sizes_json["custom"].as_array().unwrap();
	assert_eq!(sizes.len(), 1);
	let thumb_url = sizes[0]["thumbnail"].as_str().unwrap();
	let (st, _, thumb_bytes) = get_bytes(&app, thumb_url).await;
	assert_eq!(st, StatusCode::OK);
	assert!(thumb_bytes.starts_with(PNG_MAGIC), "thumbnail must be valid PNG");

	// 5. Queue items, summary & context counts
	let (st, queue_json) = get_json(&app, "/api/queue").await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(queue_json["items"].as_array().unwrap().len(), 4);
	assert_eq!(queue_json["summary"]["print"]["done"], 1);
	assert_eq!(queue_json["summary"]["print"]["failed"], 1);
	assert_eq!(queue_json["summary"]["cloud-sync"]["pending"], 1);
	assert_eq!(queue_json["summary"]["upload"]["done"], 1);
	assert_eq!(queue_json["context"]["gallerySessions"], 3);
	assert_eq!(queue_json["context"]["customAssets"], 5);
}

#[tokio::test]
async fn seed_is_idempotent_when_called_twice() {
	let ws = TempWorkspace::new("seed-idempotent");
	let state = ws.app_state();

	seed_demo_data(&state).expect("first seed should succeed");
	seed_demo_data(&state).expect("second seed should be idempotent");

	let conn = state.conn().unwrap();
	let count = |table: &str| -> i64 {
		conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
			.unwrap()
	};

	assert_eq!(count("gallery_sessions"), 3);
	assert_eq!(count("gallery_photos"), 11);
	assert_eq!(count("frames"), 2);
	assert_eq!(count("stickers"), 2);
	assert_eq!(count("filters"), 2);
	assert_eq!(count("ar_assets"), 1);
	assert_eq!(count("frame_sizes"), 1);
	assert_eq!(count("queue_items"), 4);
}

#[tokio::test]
async fn clear_seed_removes_only_seed_rows_and_preserves_user_data() {
	let ws = TempWorkspace::new("seed-clear");
	let state = ws.app_state();
	seed_demo_data(&state).expect("seed should succeed");

	let app = build_router(state.clone());
	let png_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

	// Insert real user data through the real HTTP endpoints
	let post_json = |uri: &str, body: serde_json::Value| {
		let app = app.clone();
		let uri = uri.to_string();
		async move {
			let res = app
				.oneshot(
					Request::builder()
						.method("POST")
						.uri(&uri)
						.header(header::CONTENT_TYPE, "application/json")
						.body(Body::from(body.to_string()))
						.unwrap(),
				)
				.await
				.unwrap();
			assert_eq!(res.status(), StatusCode::OK, "POST {uri} must succeed");
		}
	};

	post_json(
		"/api/gallery",
		serde_json::json!({
			"id": "user-real-1",
			"photos": [png_1x1],
			"stripDataUrl": png_1x1,
			"templateKey": "classic",
			"formatId": "2x6"
		}),
	)
	.await;
	post_json(
		"/api/assets/frames",
		serde_json::json!({
			"id": "user-frame-1",
			"name": "User Custom Frame",
			"slotCount": 1,
			"designWidth": 600,
			"designHeight": 1800,
			"artworkDataUrl": png_1x1,
			"slots": [{ "id": "s1", "name": "1", "type": "rect", "x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8, "assignedPhotoIndex": 0, "scale": 1, "offsetX": 0, "offsetY": 0 }],
			"focal": "center",
			"source": "upload",
			"formatId": "2x6",
			"enabled": true
		}),
	)
	.await;
	post_json(
		"/api/assets/filters",
		serde_json::json!({
			"key": "user-filter-1",
			"name": "User Filter",
			"category": "Fun",
			"cssFilter": "contrast(1.1)"
		}),
	)
	.await;
	post_json(
		"/api/queue",
		serde_json::json!({
			"type": "print",
			"status": "done",
			"title": "Cetak asli user"
		}),
	)
	.await;

	// Clear only seeded demo records & files
	let removed = clear_seed_data(&state).expect("clear_seed_data should succeed");
	assert_eq!(removed.sessions, 3);
	assert_eq!(removed.frames, 2);
	assert_eq!(removed.stickers, 2);
	assert_eq!(removed.filters, 2);
	assert_eq!(removed.ar_assets, 1);
	assert_eq!(removed.frame_sizes, 1);
	assert_eq!(removed.queue_items, 4);

	// Seeded disk directories/files must be gone
	assert!(!state.sessions_dir.join("seed-sess-01").exists());
	assert!(!state.frames_dir.join("seed-frame-2x6-3.png").exists());
	assert!(!state.stickers_dir.join("seed-sticker-star.png").exists());
	assert!(!state.ar_dir.join("seed-ar-sparkles.png").exists());
	assert!(!state.thumbnails_dir.join("seed-polaroid-wide.png").exists());

	// Real user records must remain intact via HTTP API
	let (_, list_json) = get_json(&app, "/api/gallery?list=1").await;
	let sessions = list_json["sessions"].as_array().unwrap();
	assert_eq!(sessions.len(), 1);
	assert_eq!(sessions[0]["id"], "user-real-1");

	let (st, _, _) = get_bytes(&app, "/api/gallery/user-real-1/strip").await;
	assert_eq!(st, StatusCode::OK);

	let (_, frames_json) = get_json(&app, "/api/assets/frames").await;
	let frames = frames_json["items"].as_array().unwrap();
	assert_eq!(frames.len(), 1);
	assert_eq!(frames[0]["id"], "user-frame-1");

	let (_, assets_json) = get_json(&app, "/api/assets").await;
	assert_eq!(assets_json["stickers"].as_array().unwrap().len(), 0);
	assert_eq!(assets_json["ar"].as_array().unwrap().len(), 0);
	let filters = assets_json["filters"].as_array().unwrap();
	assert_eq!(filters.len(), 1);
	assert_eq!(filters[0]["key"], "user-filter-1");

	let (_, queue_json) = get_json(&app, "/api/queue").await;
	let items = queue_json["items"].as_array().unwrap();
	assert_eq!(items.len(), 1);
	assert_eq!(items[0]["title"], "Cetak asli user");
}

#[test]
fn cli_seed_and_clear_seed_flags_work_end_to_end() {
	let action_seed = parse_cli_args(["--cache-dir", "custom_dir", "--seed"]);
	assert!(matches!(action_seed, CliAction::Seed(_)));

	let action_clear = parse_cli_args(["--cache-dir", "custom_dir", "--clear-seed"]);
	assert!(matches!(action_clear, CliAction::ClearSeed(_)));

	let action_serve = parse_cli_args(["--port", "4001"]);
	assert!(matches!(action_serve, CliAction::Serve(cfg) if cfg.port == 4001));

	// Execute real compiled distudio-server binary with --seed and --clear-seed
	let ws = TempWorkspace::new("cli-seed");
	let bin = env!("CARGO_BIN_EXE_distudio-server");

	let out_seed = std::process::Command::new(bin)
		.args(["--cache-dir", ws.dir.to_str().unwrap(), "--seed"])
		.output()
		.expect("distudio-server --seed must run");
	assert!(
		out_seed.status.success(),
		"--seed exited non-zero: {}",
		String::from_utf8_lossy(&out_seed.stderr)
	);

	let state = ws.app_state();
	let seeded_count: i64 = state
		.conn()
		.unwrap()
		.query_row("SELECT COUNT(*) FROM gallery_sessions", [], |r| r.get(0))
		.unwrap();
	assert_eq!(seeded_count, 3);
	drop(state);

	let out_clear = std::process::Command::new(bin)
		.args(["--cache-dir", ws.dir.to_str().unwrap(), "--clear-seed"])
		.output()
		.expect("distudio-server --clear-seed must run");
	assert!(
		out_clear.status.success(),
		"--clear-seed exited non-zero: {}",
		String::from_utf8_lossy(&out_clear.stderr)
	);

	let state_after = ws.app_state();
	let after_count: i64 = state_after
		.conn()
		.unwrap()
		.query_row("SELECT COUNT(*) FROM gallery_sessions", [], |r| r.get(0))
		.unwrap();
	assert_eq!(after_count, 0);
}
