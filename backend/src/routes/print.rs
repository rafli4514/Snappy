use std::fs;
use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::process::Command;

use crate::routes::queue::enqueue_row;
use crate::routes::settings::load_device_config;
use crate::state::{decode_data_url, now_millis, AppState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedPrinter {
	pub name: String,
	pub is_default: bool,
	pub status: &'static str,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RawWinPrinter {
	name: Option<String>,
	default: Option<bool>,
	work_offline: Option<bool>,
	printer_status: Option<i64>,
	detected_error_state: Option<i64>,
}

const PRINT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$printerName = $env:DISTUDIO_PRINTER
$imgPath = $env:DISTUDIO_IMG_PATH
$layoutMode = $env:DISTUDIO_LAYOUT
$splitMode = $env:DISTUDIO_SPLIT
$autoRotate = $env:DISTUDIO_AUTOROTATE -eq '1'
$copies = [Math]::Max(1, [int]$env:DISTUDIO_COPIES)

$Printer = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $printerName }
if (-not $Printer) { throw "Printer '$printerName' tidak ditemukan pada sistem." }
if ($Printer.WorkOffline -or $Printer.PrinterStatus -eq 7) { throw 'Printer sedang Offline.' }
if (@(4,7,8,9) -contains $Printer.DetectedErrorState) { throw "Printer bermasalah (Error State $($Printer.DetectedErrorState))." }

$img = [System.Drawing.Image]::FromFile($imgPath)
try {
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $printerName
    $doc.PrinterSettings.Copies = $copies

    $drawWithLayout = {
        param($g, $image, $rect, $mode)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $imRatio = $image.Width / $image.Height
        $rectRatio = $rect.Width / $rect.Height
        if ($mode -eq 'stretch') {
            $g.DrawImage($image, $rect)
        } elseif ($mode -eq 'fill') {
            if ($imRatio -gt $rectRatio) {
                $srcW = [int]($image.Height * $rectRatio)
                $srcH = $image.Height
            } else {
                $srcW = $image.Width
                $srcH = [int]($image.Width / $rectRatio)
            }
            $srcX = [int](($image.Width - $srcW) / 2)
            $srcY = [int](($image.Height - $srcH) / 2)
            $srcRect = New-Object System.Drawing.Rectangle($srcX, $srcY, $srcW, $srcH)
            $g.DrawImage($image, $rect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        } else {
            if ($imRatio -gt $rectRatio) {
                $drawW = $rect.Width
                $drawH = [int]($rect.Width / $imRatio)
            } else {
                $drawH = $rect.Height
                $drawW = [int]($rect.Height * $imRatio)
            }
            $x = [int]($rect.X + ($rect.Width - $drawW) / 2)
            $y = [int]($rect.Y + ($rect.Height - $drawH) / 2)
            $destRect = New-Object System.Drawing.Rectangle($x, $y, $drawW, $drawH)
            $g.DrawImage($image, $destRect)
        }
    }

    $doc.add_PrintPage({
        param($sender, $e)
        $g = $e.Graphics
        $bounds = $e.PageBounds
        $targetW = if ($splitMode -eq '2-strip') { [int][Math]::Floor($bounds.Width / 2) } else { $bounds.Width }
        $targetH = $bounds.Height
        if ($autoRotate -and (($img.Width -gt $img.Height -and $targetW -lt $targetH) -or ($img.Height -gt $img.Width -and $targetW -gt $targetH))) {
            $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
        }
        if ($splitMode -eq '2-strip') {
            $halfW = [int][Math]::Floor($bounds.Width / 2)
            $leftRect = New-Object System.Drawing.Rectangle($bounds.X, $bounds.Y, $halfW, $bounds.Height)
            $rightRect = New-Object System.Drawing.Rectangle(($bounds.X + $halfW), $bounds.Y, $halfW, $bounds.Height)
            & $drawWithLayout $g $img $leftRect $layoutMode
            & $drawWithLayout $g $img $rightRect $layoutMode
        } else {
            & $drawWithLayout $g $img $bounds $layoutMode
        }
        $e.HasMorePages = $false
    })

    $doc.Print()
    $doc.Dispose()
} finally {
    $img.Dispose()
}
"#;

pub async fn get_printers() -> Json<Value> {
	if !cfg!(target_os = "windows") {
		return Json(json!({ "ok": true, "supported": false, "printers": [] }));
	}

	let ps = "Get-CimInstance Win32_Printer | Select-Object Name, Default, WorkOffline, PrinterStatus, DetectedErrorState | ConvertTo-Json -Compress";
	let fut = Command::new("powershell")
		.args(["-NoProfile", "-Command", ps])
		.output();

	match tokio::time::timeout(Duration::from_secs(8), fut).await {
		Ok(Ok(out)) if out.status.success() => {
			let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
			if raw.is_empty() {
				return Json(json!({ "ok": true, "supported": true, "printers": [] }));
			}
			let raw_list: Vec<RawWinPrinter> = if raw.starts_with('[') {
				serde_json::from_str(&raw).unwrap_or_default()
			} else {
				serde_json::from_str::<RawWinPrinter>(&raw)
					.map(|p| vec![p])
					.unwrap_or_default()
			};

			let mut printers: Vec<DetectedPrinter> = raw_list
				.into_iter()
				.filter_map(map_printer)
				.collect();
			printers.sort_by(|a, b| {
				b.is_default
					.cmp(&a.is_default)
					.then_with(|| a.name.cmp(&b.name))
			});

			Json(json!({ "ok": true, "supported": true, "printers": printers }))
		}
		Ok(Ok(out)) => {
			let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
			Json(json!({
				"ok": true,
				"supported": true,
				"printers": [],
				"error": if msg.is_empty() { "Gagal membaca daftar printer Windows.".to_string() } else { msg }
			}))
		}
		Ok(Err(e)) => Json(json!({
			"ok": true,
			"supported": true,
			"printers": [],
			"error": e.to_string()
		})),
		Err(_) => Json(json!({
			"ok": true,
			"supported": true,
			"printers": [],
			"error": "Timeout membaca daftar printer Windows."
		})),
	}
}

fn map_printer(raw: RawWinPrinter) -> Option<DetectedPrinter> {
	let name = raw.name.as_deref().map(str::trim).filter(|s| !s.is_empty())?.to_string();
	let err_state = raw.detected_error_state.unwrap_or(0);
	let status_code = raw.printer_status.unwrap_or(0);
	let status = if matches!(err_state, 4 | 7 | 8 | 9) {
		"error"
	} else if raw.work_offline.unwrap_or(false) || status_code == 7 {
		"offline"
	} else {
		"online"
	};

	Some(DetectedPrinter {
		name,
		is_default: raw.default.unwrap_or(false),
		status,
	})
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintRequestBody {
	pub image: Option<String>,
	pub printer_name: Option<String>,
	pub layout_mode: Option<String>,
	pub auto_rotate: Option<bool>,
	pub split_mode: Option<String>,
	pub copies: Option<Value>,
	pub title: Option<String>,
}

pub async fn post_print(
	State(state): State<AppState>,
	Json(body): Json<PrintRequestBody>,
) -> (StatusCode, Json<Value>) {
	if !cfg!(target_os = "windows") {
		log_print_job(
			&state,
			"failed",
			"Cetak",
			"Cetak langsung Windows hanya tersedia di perangkat Windows.",
		);
		return (
			StatusCode::BAD_REQUEST,
			Json(json!({
				"success": false,
				"error": "Cetak langsung hanya didukung pada sistem operasi Windows."
			})),
		);
	}

	let saved = match state.conn() {
		Ok(conn) => load_device_config(&conn),
		Err(_) => Default::default(),
	};

	let printer_name = body
		.printer_name
		.unwrap_or(saved.printer_name)
		.trim()
		.to_string();
	let layout_mode = match body.layout_mode.as_deref().unwrap_or(&saved.layout_mode) {
		"fill" => "fill",
		"stretch" => "stretch",
		_ => "fit",
	};
	let split_mode = match body.split_mode.as_deref().unwrap_or(&saved.split_mode) {
		"2-strip" => "2-strip",
		_ => "none",
	};
	let auto_rotate = body.auto_rotate.unwrap_or(saved.auto_rotate);
	let copies = body
		.copies
		.as_ref()
		.and_then(|v| {
			v.as_i64()
				.or_else(|| v.as_f64().filter(|n| n.is_finite()).map(|n| n.round() as i64))
		})
		.unwrap_or(saved.copies)
		.clamp(1, 10);

	let job_title = body
		.title
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.map(str::to_string)
		.unwrap_or_else(|| {
			format!(
				"Cetak ({})",
				if printer_name.is_empty() {
					"Printer"
				} else {
					&printer_name
				}
			)
		});

	let image_raw = body.image.as_deref().unwrap_or("");
	let Some((_mime, bytes)) = decode_data_url(image_raw) else {
		log_print_job(
			&state,
			"failed",
			&job_title,
			"Data gambar cetak tidak valid atau kosong.",
		);
		return (
			StatusCode::BAD_REQUEST,
			Json(json!({ "success": false, "error": "Data gambar cetak tidak valid." })),
		);
	};

	if printer_name.is_empty() {
		log_print_job(
			&state,
			"failed",
			"Cetak gagal",
			"Belum ada printer yang dipilih di Pengaturan.",
		);
		return (
			StatusCode::BAD_REQUEST,
			Json(json!({ "success": false, "error": "Belum ada printer dipilih di Pengaturan." })),
		);
	}

	let temp_path = std::env::temp_dir().join(format!(
		"distudio-print-{}-{}.png",
		now_millis(),
		std::process::id()
	));
	if let Err(e) = fs::write(&temp_path, &bytes) {
		let msg = format!("Gagal menyiapkan berkas cetak sementara: {e}");
		log_print_job(&state, "failed", &job_title, &msg);
		return (
			StatusCode::INTERNAL_SERVER_ERROR,
			Json(json!({ "success": false, "error": msg })),
		);
	}

	let fut = Command::new("powershell")
		.args(["-NoProfile", "-Command", PRINT_SCRIPT])
		.env("DISTUDIO_PRINTER", &printer_name)
		.env("DISTUDIO_IMG_PATH", temp_path.to_string_lossy().as_ref())
		.env("DISTUDIO_LAYOUT", layout_mode)
		.env("DISTUDIO_SPLIT", split_mode)
		.env("DISTUDIO_AUTOROTATE", if auto_rotate { "1" } else { "0" })
		.env("DISTUDIO_COPIES", copies.to_string())
		.output();

	let outcome = tokio::time::timeout(Duration::from_secs(60), fut).await;
	let _ = fs::remove_file(&temp_path);

	match outcome {
		Ok(Ok(out)) => {
			let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
			let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
			if !out.status.success() || !stderr.is_empty() {
				let msg: String = if !stderr.is_empty() {
					stderr.chars().take(400).collect()
				} else {
					format!("PowerShell print exited with {}", out.status)
				};
				log_print_job(&state, "failed", &format!("{job_title} gagal"), &msg);
				return (
					StatusCode::INTERNAL_SERVER_ERROR,
					Json(json!({ "success": false, "error": msg })),
				);
			}

			let detail = format!(
				"Printer: {printer_name} · {copies} salinan · layout {layout_mode} · split {split_mode}"
			);
			log_print_job(&state, "done", &job_title, &detail);
			(
				StatusCode::OK,
				Json(json!({ "success": true, "output": stdout })),
			)
		}
		Ok(Err(e)) => {
			let msg = e.to_string();
			log_print_job(&state, "failed", &format!("{job_title} gagal"), &msg);
			(
				StatusCode::INTERNAL_SERVER_ERROR,
				Json(json!({ "success": false, "error": msg })),
			)
		}
		Err(_) => {
			let msg = "Timeout mengirim pekerjaan cetak ke printer Windows.".to_string();
			log_print_job(&state, "failed", &format!("{job_title} gagal"), &msg);
			(
				StatusCode::INTERNAL_SERVER_ERROR,
				Json(json!({ "success": false, "error": msg })),
			)
		}
	}
}

fn log_print_job(state: &AppState, status: &str, title: &str, detail: &str) {
	if let Ok(conn) = state.conn() {
		let _ = enqueue_row(
			&conn,
			"print",
			status,
			title,
			None,
			Some(detail),
			Some("api/print"),
		);
	}
}
