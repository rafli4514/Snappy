use std::fs;

use chrono::{Duration, SecondsFormat, Utc};
use rusqlite::params;
use serde_json::json;

use crate::state::AppState;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeedReport {
	pub sessions: usize,
	pub frames: usize,
	pub stickers: usize,
	pub filters: usize,
	pub ar_assets: usize,
	pub frame_sizes: usize,
	pub queue_items: usize,
}

pub fn seed_demo_data(state: &AppState) -> Result<SeedReport, String> {
	state
		.ensure_dirs()
		.map_err(|e| format!("gagal buat direktori cache: {e}"))?;

	let mut conn = state
		.conn()
		.map_err(|_| "gagal mengunci koneksi SQLite".to_string())?;
	let now = Utc::now();
	let now_ms = now.timestamp_millis();

	let tx = conn
		.transaction()
		.map_err(|e| format!("gagal mulai transaksi seed: {e}"))?;

	// 1. Seed 3 gallery sessions + 11 photos (3 + 4 + 4)
	let sessions_spec: &[(&str, &str, &str, usize, i64, [u8; 3], [u8; 3])] = &[
		(
			"seed-sess-01",
			"2x6",
			"classic",
			3,
			15,
			[245, 198, 170],
			[214, 118, 92],
		),
		(
			"seed-sess-02",
			"2x6",
			"seed-frame-2x6-4",
			4,
			65,
			[164, 206, 234],
			[68, 120, 178],
		),
		(
			"seed-sess-03",
			"4r-double",
			"classic",
			4,
			140,
			[188, 224, 186],
			[74, 142, 104],
		),
	];

	for (sid, fmt, tpl, count, mins_ago, col_a, col_b) in sessions_spec {
		let created_at = (now - Duration::minutes(*mins_ago))
			.to_rfc3339_opts(SecondsFormat::Millis, true);
		let sess_dir = state.sessions_dir.join(sid);
		fs::create_dir_all(&sess_dir)
			.map_err(|e| format!("gagal buat folder sesi {sid}: {e}"))?;

		let strip_bytes = make_gradient_png(180, 540, *col_a, *col_b);
		fs::write(sess_dir.join("strip.png"), &strip_bytes)
			.map_err(|e| format!("gagal tulis strip {sid}: {e}"))?;

		tx.execute(
			"
			INSERT OR REPLACE INTO gallery_sessions
				(id, format_id, template_key, strip_path, gif_path, video_path, photo_count, created_at)
			VALUES (?1, ?2, ?3, 'strip.png', NULL, NULL, ?4, ?5)
			",
			params![sid, fmt, tpl, *count as i64, created_at],
		)
		.map_err(|e| format!("gagal insert gallery_sessions {sid}: {e}"))?;

		tx.execute(
			"DELETE FROM gallery_photos WHERE session_id = ?1",
			params![sid],
		)
		.map_err(|e| format!("gagal reset gallery_photos {sid}: {e}"))?;

		for idx in 0..*count {
			let shift = (idx as u8).saturating_mul(22);
			let p_a = [
				col_a[0].saturating_sub(shift),
				col_a[1],
				col_a[2].saturating_add(shift / 2),
			];
			let p_b = [
				col_b[0],
				col_b[1].saturating_add(shift / 2),
				col_b[2].saturating_sub(shift / 2),
			];
			let photo_bytes = make_gradient_png(200, 150, p_a, p_b);
			let fname = format!("photo-{idx}.png");
			fs::write(sess_dir.join(&fname), &photo_bytes)
				.map_err(|e| format!("gagal tulis foto {sid}/{fname}: {e}"))?;

			tx.execute(
				"
				INSERT INTO gallery_photos (session_id, sort_order, file_path, mime_type, bytes)
				VALUES (?1, ?2, ?3, 'image/png', ?4)
				",
				params![sid, idx as i64, fname, photo_bytes.len() as i64],
			)
			.map_err(|e| format!("gagal insert gallery_photos {sid}: {e}"))?;
		}
	}

	// 2. Seed 2 custom Frame Studio templates (2x6 3-slot & 2x6 4-slot)
	let frame_3_slots = json!([
		{ "id": "s1", "name": "1", "type": "rect", "x": 0.08, "y": 0.05, "width": 0.84, "height": 0.25, "assignedPhotoIndex": 0, "scale": 1, "offsetX": 0, "offsetY": 0 },
		{ "id": "s2", "name": "2", "type": "rect", "x": 0.08, "y": 0.34, "width": 0.84, "height": 0.25, "assignedPhotoIndex": 1, "scale": 1, "offsetX": 0, "offsetY": 0 },
		{ "id": "s3", "name": "3", "type": "rect", "x": 0.08, "y": 0.63, "width": 0.84, "height": 0.25, "assignedPhotoIndex": 2, "scale": 1, "offsetX": 0, "offsetY": 0 }
	]);
	let frame_4_slots = json!([
		{ "id": "s1", "name": "1", "type": "rect", "x": 0.08, "y": 0.04, "width": 0.84, "height": 0.195, "assignedPhotoIndex": 0, "scale": 1, "offsetX": 0, "offsetY": 0 },
		{ "id": "s2", "name": "2", "type": "rect", "x": 0.08, "y": 0.26, "width": 0.84, "height": 0.195, "assignedPhotoIndex": 1, "scale": 1, "offsetX": 0, "offsetY": 0 },
		{ "id": "s3", "name": "3", "type": "rect", "x": 0.08, "y": 0.48, "width": 0.84, "height": 0.195, "assignedPhotoIndex": 2, "scale": 1, "offsetX": 0, "offsetY": 0 },
		{ "id": "s4", "name": "4", "type": "rect", "x": 0.08, "y": 0.70, "width": 0.84, "height": 0.195, "assignedPhotoIndex": 3, "scale": 1, "offsetX": 0, "offsetY": 0 }
	]);

	let frame3_art = make_frame_overlay_png(
		200,
		600,
		[248, 243, 234],
		&[(0.08, 0.05, 0.84, 0.25), (0.08, 0.34, 0.84, 0.25), (0.08, 0.63, 0.84, 0.25)],
	);
	fs::write(state.frames_dir.join("seed-frame-2x6-3.png"), &frame3_art)
		.map_err(|e| format!("gagal tulis frame 3-slot: {e}"))?;

	let frame4_art = make_frame_overlay_png(
		200,
		600,
		[28, 25, 23],
		&[
			(0.08, 0.04, 0.84, 0.195),
			(0.08, 0.26, 0.84, 0.195),
			(0.08, 0.48, 0.84, 0.195),
			(0.08, 0.70, 0.84, 0.195),
		],
	);
	fs::write(state.frames_dir.join("seed-frame-2x6-4.png"), &frame4_art)
		.map_err(|e| format!("gagal tulis frame 4-slot: {e}"))?;

	for (fid, fname, slot_count, art_file, slots_val, offset_ms) in [
		(
			"seed-frame-2x6-3",
			"Cream Minimal 3 Foto (Seed)",
			3i64,
			"seed-frame-2x6-3.png",
			frame_3_slots,
			1000i64,
		),
		(
			"seed-frame-2x6-4",
			"Noir Studio 4 Foto (Seed)",
			4i64,
			"seed-frame-2x6-4.png",
			frame_4_slots,
			0i64,
		),
	] {
		let ts = now_ms - offset_ms;
		tx.execute(
			"
			INSERT OR REPLACE INTO frames
				(id, name, format_id, slot_count, design_width, design_height, artwork_path, slots_json, focal, source, enabled, created_at, updated_at)
			VALUES (?1, ?2, '2x6', ?3, 600, 1800, ?4, ?5, 'center', 'seed', 1, ?6, ?6)
			",
			params![fid, fname, slot_count, art_file, slots_val.to_string(), ts],
		)
		.map_err(|e| format!("gagal insert frame {fid}: {e}"))?;
	}

	let now_iso = now.to_rfc3339_opts(SecondsFormat::Millis, true);

	// 3. Seed 2 custom stickers
	for (db_id, name, category, file_name, col_a, col_b) in [
		(
			900_001i64,
			"Bintang Emas (Seed)",
			"Fun",
			"seed-sticker-star.png",
			[255, 224, 102],
			[245, 159, 0],
		),
		(
			900_002i64,
			"Hati Coral (Seed)",
			"Love",
			"seed-sticker-heart.png",
			[255, 135, 135],
			[224, 49, 49],
		),
	] {
		let bytes = make_gradient_png(160, 160, col_a, col_b);
		fs::write(state.stickers_dir.join(file_name), &bytes)
			.map_err(|e| format!("gagal tulis sticker {file_name}: {e}"))?;
		tx.execute(
			"
			INSERT OR REPLACE INTO stickers
				(db_id, name, category, file_name, width, height, active, enabled, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, 160, 160, 1, 1, ?5, ?5)
			",
			params![db_id, name, category, file_name, now_iso],
		)
		.map_err(|e| format!("gagal insert sticker {db_id}: {e}"))?;
	}

	// 4. Seed 2 custom filters
	for (key, name, category, css_filter, ffmpeg) in [
		(
			"seed-warm-film",
			"Warm Film 90s (Seed)",
			"Vintage",
			"contrast(1.06) saturate(1.12) sepia(0.18)",
			"eq=contrast=1.06:saturation=1.12",
		),
		(
			"seed-bw-studio",
			"Monokrom Studio (Seed)",
			"B&W",
			"grayscale(1) contrast(1.18)",
			"hue=s=0,eq=contrast=1.18",
		),
	] {
		tx.execute(
			"
			INSERT OR REPLACE INTO filters (key, name, category, css_filter, ffmpeg, enabled, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)
			",
			params![key, name, category, css_filter, ffmpeg, now_iso],
		)
		.map_err(|e| format!("gagal insert filter {key}: {e}"))?;
	}

	// 5. Seed 1 custom AR overlay
	let ar_bytes = make_frame_overlay_png(160, 160, [130, 180, 255], &[(0.15, 0.15, 0.70, 0.70)]);
	fs::write(state.ar_dir.join("seed-ar-sparkles.png"), &ar_bytes)
		.map_err(|e| format!("gagal tulis ar overlay: {e}"))?;
	tx.execute(
		"
		INSERT OR REPLACE INTO ar_assets
			(id, name, file_name, mime_type, width, height, enabled, created_at, updated_at)
		VALUES ('seed-ar-sparkles', 'Bingkai Sparkles AR (Seed)', 'seed-ar-sparkles.png', 'image/png', 160, 160, 1, ?1, ?1)
		",
		params![now_iso],
	)
	.map_err(|e| format!("gagal insert ar_assets: {e}"))?;

	// 6. Seed 1 custom frame size + thumbnail
	let thumb_bytes = make_gradient_png(180, 140, [242, 236, 224], [202, 184, 158]);
	fs::write(
		state.thumbnails_dir.join("seed-polaroid-wide.png"),
		&thumb_bytes,
	)
	.map_err(|e| format!("gagal tulis thumbnail frame size: {e}"))?;
	tx.execute(
		"
		INSERT OR REPLACE INTO frame_sizes
			(id, label, kind, px_w, px_h, cm, photos_json, default_count, thumbnail_path, created_at, updated_at)
		VALUES ('seed-polaroid-wide', 'Polaroid Wide · Seed', 'print', 1200, 900, '10,16 × 7,62 cm', '[2,4]', 4, 'seed-polaroid-wide.png', ?1, ?1)
		",
		params![now_iso],
	)
	.map_err(|e| format!("gagal insert frame_sizes: {e}"))?;

	// 7. Seed 4 queue items across print / cloud-sync / upload
	let queue_spec: &[(&str, &str, &str, &str, Option<&str>, &str, i64)] = &[
		(
			"seed_q_print_done",
			"print",
			"done",
			"Cetak Strip seed-sess-01",
			Some("seed-sess-01"),
			"Printer: Canon SELPHY · 1 salinan · layout fit",
			10,
		),
		(
			"seed_q_print_failed",
			"print",
			"failed",
			"Cetak Ulang seed-sess-02 gagal",
			Some("seed-sess-02"),
			"Kertas printer habis saat antrean berjalan",
			30,
		),
		(
			"seed_q_sync_pending",
			"cloud-sync",
			"pending",
			"Sinkronisasi sesi seed-sess-01 ke Cloud",
			Some("seed-sess-01"),
			"Menunggu koneksi internet untuk unggah galeri publik",
			12,
		),
		(
			"seed_q_upload_done",
			"upload",
			"done",
			"Unggah Template Frame Cream Minimal",
			Some("seed-frame-2x6-3"),
			"Frame 2x6 (3 slot) tersimpan di SQLite",
			50,
		),
	];

	for (qid, qtype, status, title, ref_id, detail, mins_ago) in queue_spec {
		let ts = (now - Duration::minutes(*mins_ago)).to_rfc3339_opts(SecondsFormat::Millis, true);
		tx.execute(
			"
			INSERT OR REPLACE INTO queue_items
				(id, type, status, title, ref_id, detail, source, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'seed', ?7, ?7)
			",
			params![qid, qtype, status, title, ref_id, detail, ts],
		)
		.map_err(|e| format!("gagal insert queue_items {qid}: {e}"))?;
	}

	tx.commit()
		.map_err(|e| format!("gagal commit seed transaksi: {e}"))?;

	Ok(SeedReport {
		sessions: 3,
		frames: 2,
		stickers: 2,
		filters: 2,
		ar_assets: 1,
		frame_sizes: 1,
		queue_items: 4,
	})
}

pub fn clear_seed_data(state: &AppState) -> Result<SeedReport, String> {
	let mut conn = state
		.conn()
		.map_err(|_| "gagal mengunci koneksi SQLite".to_string())?;

	let tx = conn
		.transaction()
		.map_err(|e| format!("gagal mulai transaksi clear seed: {e}"))?;

	let seed_sessions = ["seed-sess-01", "seed-sess-02", "seed-sess-03"];
	let mut sessions = 0usize;
	for sid in seed_sessions {
		sessions += tx
			.execute("DELETE FROM gallery_sessions WHERE id = ?1", params![sid])
			.unwrap_or(0);
	}

	let seed_frames = [
		("seed-frame-2x6-3", "seed-frame-2x6-3.png"),
		("seed-frame-2x6-4", "seed-frame-2x6-4.png"),
	];
	let mut frames = 0usize;
	for (fid, _) in seed_frames {
		frames += tx
			.execute("DELETE FROM frames WHERE id = ?1", params![fid])
			.unwrap_or(0);
	}

	let seed_stickers = [
		(900_001i64, "seed-sticker-star.png"),
		(900_002i64, "seed-sticker-heart.png"),
	];
	let mut stickers = 0usize;
	for (db_id, _) in seed_stickers {
		stickers += tx
			.execute("DELETE FROM stickers WHERE db_id = ?1", params![db_id])
			.unwrap_or(0);
	}

	let mut filters = 0usize;
	for key in ["seed-warm-film", "seed-bw-studio"] {
		filters += tx
			.execute("DELETE FROM filters WHERE key = ?1", params![key])
			.unwrap_or(0);
	}

	let ar_assets = tx
		.execute("DELETE FROM ar_assets WHERE id = 'seed-ar-sparkles'", [])
		.unwrap_or(0);

	let frame_sizes = tx
		.execute(
			"DELETE FROM frame_sizes WHERE id = 'seed-polaroid-wide'",
			[],
		)
		.unwrap_or(0);

	let queue_items = tx
		.execute("DELETE FROM queue_items WHERE id LIKE 'seed_q_%'", [])
		.unwrap_or(0);

	tx.commit()
		.map_err(|e| format!("gagal commit clear seed: {e}"))?;

	for sid in seed_sessions {
		let dir = state.sessions_dir.join(sid);
		if dir.exists() {
			let _ = fs::remove_dir_all(dir);
		}
	}
	for (_, art_file) in seed_frames {
		let _ = fs::remove_file(state.frames_dir.join(art_file));
	}
	for (_, stk_file) in seed_stickers {
		let _ = fs::remove_file(state.stickers_dir.join(stk_file));
	}
	let _ = fs::remove_file(state.ar_dir.join("seed-ar-sparkles.png"));
	let _ = fs::remove_file(state.thumbnails_dir.join("seed-polaroid-wide.png"));

	Ok(SeedReport {
		sessions,
		frames,
		stickers,
		filters,
		ar_assets,
		frame_sizes,
		queue_items,
	})
}

fn make_gradient_png(width: u32, height: u32, top: [u8; 3], bottom: [u8; 3]) -> Vec<u8> {
	encode_rgba_png(width, height, |_x, y| {
		let t = if height <= 1 {
			0.0
		} else {
			y as f32 / (height - 1) as f32
		};
		let lerp = |a: u8, b: u8| -> u8 { ((a as f32) + ((b as f32) - (a as f32)) * t).round() as u8 };
		[lerp(top[0], bottom[0]), lerp(top[1], bottom[1]), lerp(top[2], bottom[2]), 255]
	})
}

fn make_frame_overlay_png(
	width: u32,
	height: u32,
	bg: [u8; 3],
	holes: &[(f32, f32, f32, f32)],
) -> Vec<u8> {
	encode_rgba_png(width, height, |x, y| {
		let nx = x as f32 / width as f32;
		let ny = y as f32 / height as f32;
		for &(hx, hy, hw, hh) in holes {
			if nx >= hx && nx <= hx + hw && ny >= hy && ny <= hy + hh {
				return [0, 0, 0, 0];
			}
		}
		[bg[0], bg[1], bg[2], 255]
	})
}

fn encode_rgba_png<F>(width: u32, height: u32, mut pixel: F) -> Vec<u8>
where
	F: FnMut(u32, u32) -> [u8; 4],
{
	let stride = (width as usize) * 4 + 1;
	let mut raw = Vec::with_capacity(stride * (height as usize));
	for y in 0..height {
		raw.push(0); // PNG filter type 0 (None)
		for x in 0..width {
			raw.extend_from_slice(&pixel(x, y));
		}
	}

	let compressed = zlib_stored(&raw);
	let mut out = Vec::with_capacity(compressed.len() + 64);
	out.extend_from_slice(b"\x89PNG\r\n\x1a\n");

	let mut ihdr = Vec::with_capacity(13);
	ihdr.extend_from_slice(&width.to_be_bytes());
	ihdr.extend_from_slice(&height.to_be_bytes());
	ihdr.extend_from_slice(&[8, 6, 0, 0, 0]); // 8-bit RGBA
	push_png_chunk(&mut out, b"IHDR", &ihdr);
	push_png_chunk(&mut out, b"IDAT", &compressed);
	push_png_chunk(&mut out, b"IEND", &[]);
	out
}

fn zlib_stored(data: &[u8]) -> Vec<u8> {
	const MAX_BLOCK: usize = 65_535;
	let blocks = data.len().div_ceil(MAX_BLOCK).max(1);
	let mut out = Vec::with_capacity(2 + data.len() + blocks * 5 + 4);
	out.extend_from_slice(&[0x78, 0x01]);

	if data.is_empty() {
		out.push(0x01);
		out.extend_from_slice(&0u16.to_le_bytes());
		out.extend_from_slice(&(!0u16).to_le_bytes());
	} else {
		let mut offset = 0;
		while offset < data.len() {
			let end = (offset + MAX_BLOCK).min(data.len());
			let chunk = &data[offset..end];
			let bfinal = if end == data.len() { 0x01 } else { 0x00 };
			let len = chunk.len() as u16;
			out.push(bfinal);
			out.extend_from_slice(&len.to_le_bytes());
			out.extend_from_slice(&(!len).to_le_bytes());
			out.extend_from_slice(chunk);
			offset = end;
		}
	}

	let adler = adler32(data);
	out.extend_from_slice(&adler.to_be_bytes());
	out
}

fn adler32(data: &[u8]) -> u32 {
	const MOD: u32 = 65_521;
	let mut a: u32 = 1;
	let mut b: u32 = 0;
	for &byte in data {
		a = (a + byte as u32) % MOD;
		b = (b + a) % MOD;
	}
	(b << 16) | a
}

fn push_png_chunk(out: &mut Vec<u8>, chunk_type: &[u8; 4], payload: &[u8]) {
	out.extend_from_slice(&(payload.len() as u32).to_be_bytes());
	out.extend_from_slice(chunk_type);
	out.extend_from_slice(payload);
	let crc = crc32(chunk_type, payload);
	out.extend_from_slice(&crc.to_be_bytes());
}

fn crc32(chunk_type: &[u8; 4], payload: &[u8]) -> u32 {
	let mut crc: u32 = 0xFFFF_FFFF;
	for &b in chunk_type.iter().chain(payload.iter()) {
		crc ^= b as u32;
		for _ in 0..8 {
			if (crc & 1) != 0 {
				crc = (crc >> 1) ^ 0xEDB8_8320;
			} else {
				crc >>= 1;
			}
		}
	}
	!crc
}
