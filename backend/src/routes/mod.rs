pub mod assets;
pub mod cloud;
pub mod frame_sizes;
pub mod frames;
pub mod gallery;
pub mod network;
pub mod print;
pub mod queue;
pub mod settings;

use axum::extract::{DefaultBodyLimit, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use crate::state::AppState;

pub fn build_router(state: AppState) -> Router {
	let static_dir = state.static_dir.clone();

	let api_router = Router::new()
		.route("/api/health", get(health_check))
		// Galeri
		.route("/api/gallery", post(gallery::post_gallery).get(gallery::get_gallery_index))
		.route(
			"/api/gallery/:id",
			get(gallery::get_gallery_by_id).delete(gallery::delete_gallery_by_id),
		)
		.route("/api/gallery/:id/strip", get(gallery::get_gallery_strip))
		.route("/api/gallery/:id/media/:file", get(gallery::get_gallery_media))
		// Frame Studio
		.route(
			"/api/assets/frames",
			get(frames::get_frames)
				.post(frames::post_frame)
				.put(frames::put_frame)
				.delete(frames::delete_frame),
		)
		.route("/api/assets/frames/:file", get(frames::get_frame_file))
		// Aset Kustom (Stiker, Filter, AR Overlay)
		.route("/api/assets", get(assets::get_all_assets))
		.route(
			"/api/assets/stickers",
			get(assets::get_stickers)
				.post(assets::post_sticker)
				.put(assets::put_sticker)
				.delete(assets::delete_sticker),
		)
		.route("/api/assets/stickers/:file", get(assets::get_sticker_file))
		.route(
			"/api/assets/filters",
			get(assets::get_filters)
				.post(assets::post_filter)
				.put(assets::put_filter)
				.delete(assets::delete_filter),
		)
		.route(
			"/api/assets/ar",
			get(assets::get_ar_assets)
				.post(assets::post_ar_asset)
				.put(assets::put_ar_asset)
				.delete(assets::delete_ar_asset),
		)
		.route("/api/assets/ar/:file", get(assets::get_ar_file))
		// Ukuran Frame
		.route(
			"/api/frame-sizes",
			get(frame_sizes::get_frame_sizes)
				.post(frame_sizes::post_frame_size)
				.put(frame_sizes::put_frame_size)
				.delete(frame_sizes::delete_frame_size),
		)
		.route(
			"/api/frame-sizes/thumbnails/:file",
			get(frame_sizes::get_frame_size_thumbnail),
		)
		// Antrean
		.route(
			"/api/queue",
			get(queue::get_queue)
				.post(queue::post_queue)
				.patch(queue::patch_queue)
				.delete(queue::delete_queue),
		)
		// Printer, Device Settings & LAN IP
		.route(
			"/api/settings/device",
			get(settings::get_device_settings).put(settings::put_device_settings),
		)
		.route("/api/printers", get(print::get_printers))
		.route("/api/print", post(print::post_print))
		.route("/api/network-ip", get(network::get_network_ip))
		// Google Drive Cloud Sync & OAuth 2.0
		.route("/api/cloud/google/status", get(cloud::get_google_status))
		.route(
			"/api/cloud/google/config",
			axum::routing::put(cloud::put_google_config),
		)
		.route("/api/cloud/google/auth", get(cloud::get_google_auth))
		.route(
			"/api/cloud/google/callback",
			get(cloud::get_google_callback),
		)
		.route(
			"/api/cloud/google/disconnect",
			post(cloud::post_google_disconnect),
		)
		.route(
			"/api/cloud/google/folders",
			get(cloud::get_google_folders).post(cloud::post_google_folder),
		)
		.route("/api/cloud/sync", post(cloud::post_cloud_sync))
		.route(
			"/api/cloud/sync/:session_id",
			get(cloud::get_session_cloud_sync),
		)
		.layer(DefaultBodyLimit::max(64 * 1024 * 1024))
		.layer(CorsLayer::permissive())
		.with_state(state);

	if let Some(dir) = static_dir.filter(|d| d.join("index.html").is_file()) {
		let fallback = ServeDir::new(&dir).fallback(ServeFile::new(dir.join("index.html")));
		api_router.fallback_service(fallback)
	} else {
		api_router
	}
}

async fn health_check(State(state): State<AppState>) -> Json<Value> {
	let sessions_count = state
		.conn()
		.ok()
		.and_then(|c| {
			c.query_row("SELECT COUNT(*) FROM gallery_sessions", [], |r| {
				r.get::<_, i64>(0)
			})
			.ok()
		})
		.unwrap_or(0);

	Json(json!({
		"ok": true,
		"status": "healthy",
		"runtime": "rust-axum",
		"sqliteWal": true,
		"sessions": sessions_count
	}))
}
