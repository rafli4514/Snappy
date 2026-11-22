use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::Path as AxumPath;
use axum::http::{header, Request, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use distudio_backend::db::seed::seed_demo_data;
use distudio_backend::routes::build_router;
use distudio_backend::routes::cloud::{
	build_google_auth_url, get_valid_access_token_with_endpoints, sync_session_with_endpoints,
	GoogleEndpoints,
};
use distudio_backend::{init_app_state, AppState, ServerConfig};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

struct TempDir {
	dir: PathBuf,
}

impl TempDir {
	fn new(label: &str) -> Self {
		let unique = format!(
			"distudio-cloud-{}-{}-{}",
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

async fn send_json(app: &Router, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
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
async fn cloud_config_redacts_secrets_and_builds_least_privilege_oauth_url() {
	let ws = TempDir::new("config-redact");
	let app = build_router(ws.state());

	let (st, res) = send_json(
		&app,
		"PUT",
		"/api/cloud/google/config",
		Some(json!({
			"clientId": "cid-123.apps.googleusercontent.com",
			"clientSecret": "super-secret-value",
			"rootFolderName": "DISTUDIO Studio",
			"autoSync": true,
			"uploadTypes": { "strip": true, "photos": true, "gif": false, "video": false }
		})),
	)
	.await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(res["ok"], true);

	let (st, status) = send_json(&app, "GET", "/api/cloud/google/status", None).await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(status["configured"], true);
	assert_eq!(status["hasClientId"], true);
	assert_eq!(status["hasClientSecret"], true);
	assert_eq!(status["connected"], false);
	assert_eq!(status["rootFolderName"], "DISTUDIO Studio");
	assert_eq!(status["uploadTypes"]["gif"], false);
	// Must never leak secrets in status JSON
	let serialized = status.to_string();
	assert!(!serialized.contains("super-secret-value"));
	assert!(status.get("clientSecret").is_none());
	assert!(status.get("refreshToken").is_none());
	assert!(status.get("accessToken").is_none());

	let url = build_google_auth_url(
		"cid-123.apps.googleusercontent.com",
		"http://localhost:5173/api/cloud/google/callback",
		"nonce-abc",
	);
	assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
	assert!(url.contains("access_type=offline"));
	assert!(url.contains("prompt=consent"));
	assert!(url.contains("drive.file"));
	assert!(url.contains("state=nonce-abc"));
}

#[tokio::test]
async fn oauth_auth_sets_cookie_and_callback_rejects_mismatched_state() {
	let ws = TempDir::new("oauth-csrf");
	let app = build_router(ws.state());

	let (st, _) = send_json(
		&app,
		"PUT",
		"/api/cloud/google/config",
		Some(json!({
			"clientId": "cid-1",
			"clientSecret": "sec-1"
		})),
	)
	.await;
	assert_eq!(st, StatusCode::OK);

	let auth_res = app
		.clone()
		.oneshot(
			Request::builder()
				.uri("/api/cloud/google/auth")
				.header(header::HOST, "localhost:5173")
				.body(Body::empty())
				.unwrap(),
		)
		.await
		.unwrap();
	assert_eq!(auth_res.status(), StatusCode::FOUND);
	let loc = auth_res
		.headers()
		.get(header::LOCATION)
		.and_then(|v| v.to_str().ok())
		.unwrap_or("");
	assert!(loc.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
	assert!(loc.contains("localhost%3A5173%2Fapi%2Fcloud%2Fgoogle%2Fcallback"));

	let cookie_hdr = auth_res
		.headers()
		.get(header::SET_COOKIE)
		.and_then(|v| v.to_str().ok())
		.unwrap_or("");
	assert!(cookie_hdr.contains("distudio_oauth_state="));
	assert!(cookie_hdr.contains("HttpOnly"));

	// Callback without matching state cookie must fail with 400
	let cb_bad = app
		.clone()
		.oneshot(
			Request::builder()
				.uri("/api/cloud/google/callback?code=fake&state=wrong-state")
				.header(header::COOKIE, "distudio_oauth_state=different-state")
				.body(Body::empty())
				.unwrap(),
		)
		.await
		.unwrap();
	assert_eq!(cb_bad.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn token_refresh_invalid_grant_marks_needs_reconnect() {
	let ws = TempDir::new("invalid-grant");
	let state = ws.state();

	{
		let conn = state.conn().unwrap();
		conn.execute(
			"
			UPDATE cloud_config SET
				client_id = 'cid',
				client_secret = 'sec',
				access_token = 'expired-tok',
				refresh_token = 'bad-refresh',
				token_expires_at = '2020-01-01T00:00:00.000Z',
				email = 'booth@gmail.com',
				needs_reconnect = 0
			WHERE id = 1
			",
			[],
		)
		.unwrap();
	}

	// Spin up local fake Google OAuth token server returning invalid_grant
	let mock = Router::new().route(
		"/token",
		post(|| async {
			(
				StatusCode::BAD_REQUEST,
				Json(json!({ "error": "invalid_grant", "error_description": "Token has been revoked" })),
			)
		}),
	);
	let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
	let addr = listener.local_addr().unwrap();
	tokio::spawn(async move {
		let _ = axum::serve(listener, mock).await;
	});

	let endpoints = GoogleEndpoints {
		token_url: format!("http://{addr}/token"),
		userinfo_url: format!("http://{addr}/userinfo"),
		drive_files_url: format!("http://{addr}/drive/v3/files"),
		drive_upload_url: format!("http://{addr}/upload/drive/v3/files"),
	};

	let err = get_valid_access_token_with_endpoints(&state, &endpoints)
		.await
		.expect_err("expired revoked token must fail");
	assert!(
		err.to_lowercase().contains("kedaluwarsa"),
		"error should guide reconnect in Indonesian, got: {err}"
	);

	let app = build_router(state);
	let (_, status) = send_json(&app, "GET", "/api/cloud/google/status", None).await;
	assert_eq!(status["needsReconnect"], true);
}

#[tokio::test]
async fn sync_session_skips_already_uploaded_files_on_retry() {
	let ws = TempDir::new("idempotent-sync");
	let state = ws.state();
	seed_demo_data(&state).unwrap();

	{
		let conn = state.conn().unwrap();
		conn.execute(
			"
			UPDATE cloud_config SET
				client_id = 'cid',
				client_secret = 'sec',
				access_token = 'valid-tok',
				refresh_token = 'ref-tok',
				token_expires_at = '2099-01-01T00:00:00.000Z',
				email = 'booth@gmail.com',
				root_folder_name = 'DISTUDIO',
				upload_strip = 1,
				upload_photos = 1,
				upload_gif = 0,
				upload_video = 0
			WHERE id = 1
			",
			[],
		)
		.unwrap();
	}

	let uploaded_names: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
	let fail_photo_2_once: Arc<Mutex<bool>> = Arc::new(Mutex::new(true));

	let uploaded_clone = uploaded_names.clone();
	let fail_clone = fail_photo_2_once.clone();

	let mock = Router::new()
		.route(
			"/drive/v3/files",
			get(|| async { Json(json!({ "files": [] })) }).post(|Json(body): Json<Value>| async move {
				let name = body["name"].as_str().unwrap_or("folder");
				Json(json!({
					"id": format!("folder-{name}"),
					"webViewLink": format!("https://drive.google.com/drive/folders/folder-{name}")
				}))
			}),
		)
		.route(
			"/upload/drive/v3/files",
			post(move |body: axum::body::Bytes| {
				let uploaded = uploaded_clone.clone();
				let fail_flag = fail_clone.clone();
				async move {
					let text = String::from_utf8_lossy(&body);
					// Extract "name":"..." from the JSON metadata part of multipart/related
					let fname = text
						.split("\"name\":\"")
						.nth(1)
						.and_then(|rest| rest.split('"').next())
						.unwrap_or("unknown")
						.to_string();

					if fname == "photo-1.png" {
						let mut f = fail_flag.lock().unwrap();
						if *f {
							*f = false;
							return (
								StatusCode::INTERNAL_SERVER_ERROR,
								Json(json!({ "error": "simulated network drop" })),
							);
						}
					}

					uploaded.lock().unwrap().push(fname.clone());
					(
						StatusCode::OK,
						Json(json!({
							"id": format!("file-{fname}"),
							"webViewLink": format!("https://drive.google.com/file/d/file-{fname}/view")
						})),
					)
				}
			}),
		);

	let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
	let addr = listener.local_addr().unwrap();
	tokio::spawn(async move {
		let _ = axum::serve(listener, mock).await;
	});

	let endpoints = GoogleEndpoints {
		token_url: format!("http://{addr}/token"),
		userinfo_url: format!("http://{addr}/userinfo"),
		drive_files_url: format!("http://{addr}/drive/v3/files"),
		drive_upload_url: format!("http://{addr}/upload/drive/v3/files"),
	};

	// First attempt: strip.png + photo-0.png succeed, photo-1.png fails!
	let res1 = sync_session_with_endpoints(&state, "seed-sess-01", &endpoints).await;
	assert_eq!(res1.status, "failed");
	assert_eq!(res1.uploaded_count, 2);

	// Second attempt (retry): must SKIP strip.png and photo-0.png, upload only photo-1.png & photo-2.png!
	let res2 = sync_session_with_endpoints(&state, "seed-sess-01", &endpoints).await;
	assert_eq!(res2.status, "done");
	assert_eq!(res2.skipped_count, 2);
	assert_eq!(res2.uploaded_count, 2);
	assert!(res2
		.drive_folder_url
		.as_deref()
		.unwrap_or("")
		.starts_with("https://drive.google.com/drive/folders/"));

	let all_uploaded = uploaded_names.lock().unwrap().clone();
	assert_eq!(
		all_uploaded,
		vec!["strip.png", "photo-0.png", "photo-1.png", "photo-2.png"]
	);
}

#[tokio::test]
async fn cloud_config_persists_public_share_and_qr_mode_and_migrates_legacy_db() {
	let ws = TempDir::new("smart-qr-config-migrate");

	// Simulate an existing pre-Smart-QR SQLite DB missing public_share, qr_mode, is_public, total_files
	{
		let db_path = ws.dir.join("distudio.db");
		let conn = rusqlite::Connection::open(&db_path).unwrap();
		conn.execute_batch(
			"
			CREATE TABLE cloud_config (
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
				last_sync_at TEXT NOT NULL DEFAULT '',
				updated_at TEXT NOT NULL DEFAULT ''
			);
			INSERT INTO cloud_config (id, client_id, email) VALUES (1, 'legacy-cid', 'legacy@gmail.com');

			CREATE TABLE gallery_sessions (
				id TEXT PRIMARY KEY,
				format_id TEXT,
				template_key TEXT NOT NULL DEFAULT '',
				strip_path TEXT,
				gif_path TEXT,
				video_path TEXT,
				photo_count INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			);
			INSERT INTO gallery_sessions (id, created_at) VALUES ('legacy-s1', '2026-11-22T10:00:00.000Z');

			CREATE TABLE cloud_session_sync (
				session_id TEXT PRIMARY KEY REFERENCES gallery_sessions(id) ON DELETE CASCADE,
				status TEXT NOT NULL DEFAULT 'pending',
				drive_folder_id TEXT NOT NULL DEFAULT '',
				drive_folder_url TEXT NOT NULL DEFAULT '',
				uploaded_files_json TEXT NOT NULL DEFAULT '{}',
				last_error TEXT NOT NULL DEFAULT '',
				updated_at TEXT NOT NULL DEFAULT ''
			);
			INSERT INTO cloud_session_sync (session_id, status, drive_folder_id, drive_folder_url)
			VALUES ('legacy-s1', 'done', 'fld-legacy', 'https://drive.google.com/drive/folders/fld-legacy');
			",
		)
		.unwrap();
	}

	// Opening AppState must cleanly migrate existing DB without losing legacy rows
	let state = ws.state();
	let app = build_router(state);

	let (st, status) = send_json(&app, "GET", "/api/cloud/google/status", None).await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(status["clientId"], "legacy-cid");
	assert_eq!(status["email"], "legacy@gmail.com");
	assert_eq!(status["publicShare"], true);
	assert_eq!(status["qrMode"], "smart");

	// Update publicShare=false & qrMode=local
	let (st, updated) = send_json(
		&app,
		"PUT",
		"/api/cloud/google/config",
		Some(json!({
			"publicShare": false,
			"qrMode": "local"
		})),
	)
	.await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(updated["publicShare"], false);
	assert_eq!(updated["qrMode"], "local");

	// Unknown qrMode must normalize safely to "smart"
	let (st, normalized) = send_json(
		&app,
		"PUT",
		"/api/cloud/google/config",
		Some(json!({
			"qrMode": "invalid-value"
		})),
	)
	.await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(normalized["qrMode"], "smart");
	assert_eq!(normalized["publicShare"], false);
}

#[tokio::test]
async fn sync_grants_public_reader_only_on_session_folder_and_is_idempotent() {
	let ws = TempDir::new("public-folder-share");
	let state = ws.state();
	seed_demo_data(&state).unwrap();

	{
		let conn = state.conn().unwrap();
		conn.execute(
			"
			UPDATE cloud_config SET
				client_id = 'cid',
				client_secret = 'sec',
				access_token = 'valid-tok',
				refresh_token = 'ref-tok',
				token_expires_at = '2099-01-01T00:00:00.000Z',
				email = 'booth@gmail.com',
				root_folder_name = 'DISTUDIO',
				auto_sync = 1,
				public_share = 1,
				qr_mode = 'smart',
				upload_strip = 1,
				upload_photos = 1,
				upload_gif = 0,
				upload_video = 0
			WHERE id = 1
			",
			[],
		)
		.unwrap();
	}

	let perm_calls: Arc<Mutex<Vec<(String, String, String)>>> = Arc::new(Mutex::new(Vec::new()));
	let perm_calls_clone = perm_calls.clone();

	let mock = Router::new()
		.route(
			"/drive/v3/files",
			get(|| async { Json(json!({ "files": [] })) }).post(|Json(body): Json<Value>| async move {
				let name = body["name"].as_str().unwrap_or("folder");
				Json(json!({
					"id": format!("folder-{name}"),
					"webViewLink": format!("https://drive.google.com/drive/folders/folder-{name}")
				}))
			}),
		)
		.route(
			"/drive/v3/files/:file_id/permissions",
			post(move |AxumPath(file_id): AxumPath<String>, Json(body): Json<Value>| {
				let calls = perm_calls_clone.clone();
				async move {
					let role = body["role"].as_str().unwrap_or("").to_string();
					let kind = body["type"].as_str().unwrap_or("").to_string();
					calls.lock().unwrap().push((file_id, role, kind));
					(StatusCode::OK, Json(json!({ "id": "anyoneWithLink" })))
				}
			}),
		)
		.route(
			"/upload/drive/v3/files",
			post(|body: axum::body::Bytes| async move {
				let text = String::from_utf8_lossy(&body);
				let fname = text
					.split("\"name\":\"")
					.nth(1)
					.and_then(|rest| rest.split('"').next())
					.unwrap_or("file")
					.to_string();
				(
					StatusCode::OK,
					Json(json!({
						"id": format!("file-{fname}"),
						"webViewLink": format!("https://drive.google.com/file/d/file-{fname}/view")
					})),
				)
			}),
		);

	let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
	let addr = listener.local_addr().unwrap();
	tokio::spawn(async move {
		let _ = axum::serve(listener, mock).await;
	});

	let endpoints = GoogleEndpoints {
		token_url: format!("http://{addr}/token"),
		userinfo_url: format!("http://{addr}/userinfo"),
		drive_files_url: format!("http://{addr}/drive/v3/files"),
		drive_upload_url: format!("http://{addr}/upload/drive/v3/files"),
	};

	let res1 = sync_session_with_endpoints(&state, "seed-sess-01", &endpoints).await;
	assert_eq!(res1.status, "done");
	assert_eq!(res1.uploaded_count, 4);

	// Permission must ONLY be granted on the session folder, never root or date folders
	assert_eq!(
		*perm_calls.lock().unwrap(),
		vec![(
			"folder-sesi-seed-sess-01".to_string(),
			"reader".to_string(),
			"anyone".to_string()
		)]
	);

	// Query session sync status endpoint
	let app = build_router(state.clone());
	let (st, sync_status) = send_json(&app, "GET", "/api/cloud/sync/seed-sess-01", None).await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(sync_status["ok"], true);
	assert_eq!(sync_status["sessionId"], "seed-sess-01");
	assert_eq!(sync_status["qrMode"], "smart");
	assert_eq!(sync_status["cloudEligible"], true);
	assert_eq!(sync_status["status"], "done");
	assert_eq!(sync_status["isPublic"], true);
	assert_eq!(sync_status["uploadedCount"], 4);
	assert_eq!(sync_status["totalFiles"], 4);
	assert_eq!(
		sync_status["driveFolderUrl"],
		"https://drive.google.com/drive/folders/folder-sesi-seed-sess-01"
	);

	// Retry sync: must NOT call permissions API a second time
	let res2 = sync_session_with_endpoints(&state, "seed-sess-01", &endpoints).await;
	assert_eq!(res2.status, "done");
	assert_eq!(res2.skipped_count, 4);
	assert_eq!(perm_calls.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn sync_permission_failure_keeps_is_public_false_and_gallery_post_reports_cloud_eligible() {
	let ws = TempDir::new("perm-fail-and-eligible");
	let state = ws.state();
	seed_demo_data(&state).unwrap();

	{
		let conn = state.conn().unwrap();
		conn.execute(
			"
			UPDATE cloud_config SET
				client_id = 'cid',
				client_secret = 'sec',
				access_token = 'valid-tok',
				refresh_token = 'ref-tok',
				token_expires_at = '2099-01-01T00:00:00.000Z',
				email = 'booth@gmail.com',
				root_folder_name = 'DISTUDIO',
				auto_sync = 1,
				public_share = 1,
				qr_mode = 'smart',
				upload_strip = 1,
				upload_photos = 0,
				upload_gif = 0,
				upload_video = 0
			WHERE id = 1
			",
			[],
		)
		.unwrap();
	}

	let mock = Router::new()
		.route(
			"/drive/v3/files",
			get(|| async { Json(json!({ "files": [] })) }).post(|Json(body): Json<Value>| async move {
				let name = body["name"].as_str().unwrap_or("folder");
				Json(json!({
					"id": format!("folder-{name}"),
					"webViewLink": format!("https://drive.google.com/drive/folders/folder-{name}")
				}))
			}),
		)
		.route(
			"/drive/v3/files/:file_id/permissions",
			post(|| async {
				(
					StatusCode::FORBIDDEN,
					Json(json!({ "error": { "message": "Domain policy forbids public sharing" } })),
				)
			}),
		)
		.route(
			"/upload/drive/v3/files",
			post(|_body: axum::body::Bytes| async {
				(
					StatusCode::OK,
					Json(json!({
						"id": "file-strip",
						"webViewLink": "https://drive.google.com/file/d/file-strip/view"
					})),
				)
			}),
		);

	let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
	let addr = listener.local_addr().unwrap();
	tokio::spawn(async move {
		let _ = axum::serve(listener, mock).await;
	});

	let endpoints = GoogleEndpoints {
		token_url: format!("http://{addr}/token"),
		userinfo_url: format!("http://{addr}/userinfo"),
		drive_files_url: format!("http://{addr}/drive/v3/files"),
		drive_upload_url: format!("http://{addr}/upload/drive/v3/files"),
	};

	// Backup upload still succeeds, but isPublic MUST remain false so /print falls back to LAN
	let res = sync_session_with_endpoints(&state, "seed-sess-01", &endpoints).await;
	assert_eq!(res.status, "done");
	assert_eq!(res.uploaded_count, 1);

	let app = build_router(state.clone());
	let (st, sync_status) = send_json(&app, "GET", "/api/cloud/sync/seed-sess-01", None).await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(sync_status["isPublic"], false);

	// Unsafe session ID rejected with 400
	let (st_bad, _) = send_json(&app, "GET", "/api/cloud/sync/bad%20id", None).await;
	assert_eq!(st_bad, StatusCode::BAD_REQUEST);

	// POST /api/gallery reports cloudEligible=true when smart + autoSync + publicShare + connected
	let (st_g1, g1) = send_json(
		&app,
		"POST",
		"/api/gallery",
		Some(json!({
			"id": "qr-test-1",
			"photos": [],
			"stripDataUrl": "",
			"templateKey": "classic"
		})),
	)
	.await;
	assert_eq!(st_g1, StatusCode::OK);
	assert_eq!(g1["cloudEligible"], true);

	// Switching qrMode to "local" makes cloudEligible=false
	let _ = send_json(
		&app,
		"PUT",
		"/api/cloud/google/config",
		Some(json!({ "qrMode": "local" })),
	)
	.await;
	let (st_g2, g2) = send_json(
		&app,
		"POST",
		"/api/gallery",
		Some(json!({
			"id": "qr-test-2",
			"photos": [],
			"stripDataUrl": "",
			"templateKey": "classic"
		})),
	)
	.await;
	assert_eq!(st_g2, StatusCode::OK);
	assert_eq!(g2["cloudEligible"], false);

	// Back to "smart" but publicShare=false -> cloudEligible=false
	let _ = send_json(
		&app,
		"PUT",
		"/api/cloud/google/config",
		Some(json!({ "qrMode": "smart", "publicShare": false })),
	)
	.await;
	let (st_g3, g3) = send_json(
		&app,
		"POST",
		"/api/gallery",
		Some(json!({
			"id": "qr-test-3",
			"photos": [],
			"stripDataUrl": "",
			"templateKey": "classic"
		})),
	)
	.await;
	assert_eq!(st_g3, StatusCode::OK);
	assert_eq!(g3["cloudEligible"], false);
}

#[tokio::test]
async fn cloud_config_supports_gallery_qr_mode_and_sanitizes_public_base_url() {
	let ws = TempDir::new("gallery-qr-mode-base-url");
	let state = ws.state();

	{
		let conn = state.conn().unwrap();
		conn.execute(
			"
			UPDATE cloud_config SET
				client_id = 'cid',
				client_secret = 'sec',
				access_token = 'valid-tok',
				refresh_token = 'ref-tok',
				token_expires_at = '2099-01-01T00:00:00.000Z',
				email = 'booth@gmail.com',
				auto_sync = 1,
				public_share = 1
			WHERE id = 1
			",
			[],
		)
		.unwrap();
	}

	let app = build_router(state);

	// Accept qrMode="gallery" and sanitize trailing slashes on publicBaseUrl
	let (st, cfg1) = send_json(
		&app,
		"PUT",
		"/api/cloud/google/config",
		Some(json!({
			"qrMode": "gallery",
			"publicBaseUrl": "https://booth.example.com///"
		})),
	)
	.await;
	assert_eq!(st, StatusCode::OK);
	assert_eq!(cfg1["qrMode"], "gallery");
	assert_eq!(cfg1["publicBaseUrl"], "https://booth.example.com");

	// POST /api/gallery in "gallery" mode returns qrMode="gallery" & cloudEligible=false
	let (st_g, g) = send_json(
		&app,
		"POST",
		"/api/gallery",
		Some(json!({
			"id": "gal-mode-1",
			"photos": [],
			"stripDataUrl": "",
			"templateKey": "classic"
		})),
	)
	.await;
	assert_eq!(st_g, StatusCode::OK);
	assert_eq!(g["qrMode"], "gallery");
	assert_eq!(g["cloudEligible"], false);

	// GET /api/cloud/sync/:id reports qrMode="gallery" & publicBaseUrl
	let (st_s, s) = send_json(&app, "GET", "/api/cloud/sync/gal-mode-1", None).await;
	assert_eq!(st_s, StatusCode::OK);
	assert_eq!(s["qrMode"], "gallery");
	assert_eq!(s["publicBaseUrl"], "https://booth.example.com");

	// Non-http(s) URL must be rejected/cleared to null/empty (prevent javascript: XSS)
	let (st_xss, cfg2) = send_json(
		&app,
		"PUT",
		"/api/cloud/google/config",
		Some(json!({
			"publicBaseUrl": "javascript:alert(1)"
		})),
	)
	.await;
	assert_eq!(st_xss, StatusCode::OK);
	assert!(cfg2["publicBaseUrl"].is_null());
}
