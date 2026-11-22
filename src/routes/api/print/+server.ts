/**
 * Print endpoint
 * Uses PowerShell PrintDocument to send an image to a Windows printer.
 *
 * POST /api/print
 * Body: { image, printerName?, layoutMode?, autoRotate?, splitMode?, copies?, title? }
 * Returns: { success: boolean, output?: string, error?: string }
 */

import { json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getDeviceConfig } from '#lib/server/deviceConfigStore';
import { enqueue } from '#lib/server/queueStore';

function logPrint(status: 'done' | 'failed' | 'skipped', detail: string, title = 'Cetak'): void {
	try {
		enqueue({ type: 'print', status, title, detail, source: 'api/print' });
	} catch {
		// logging must not affect printing
	}
}

const execFileAsync = promisify(execFile);

interface PrintRequest {
	image: string; // data URL
	printerName?: string;
	layoutMode?: 'stretch' | 'fit' | 'fill';
	autoRotate?: boolean;
	splitMode?: 'none' | '2-strip';
	copies?: number;
	title?: string;
}

const PRINT_SCRIPT = `
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
`;

export async function POST({ request }: { request: Request }) {
	let tempPath: string | null = null;
	try {
		if (process.platform !== 'win32') {
			logPrint('failed', 'Cetak langsung Windows hanya tersedia di perangkat Windows.');
			return json(
				{ success: false, error: 'Cetak langsung hanya didukung pada sistem operasi Windows.' },
				{ status: 400 }
			);
		}

		const saved = getDeviceConfig();
		const body = (await request.json()) as PrintRequest;
		const image = typeof body.image === 'string' ? body.image : '';
		const printerName = (body.printerName ?? saved.printerName ?? '').trim();
		const layoutMode = body.layoutMode ?? saved.layoutMode ?? 'fit';
		const autoRotate = typeof body.autoRotate === 'boolean' ? body.autoRotate : saved.autoRotate;
		const splitMode = body.splitMode ?? saved.splitMode ?? 'none';
		const copies = Math.max(1, Math.min(10, Math.round(Number(body.copies ?? saved.copies) || 1)));
		const jobTitle = body.title?.trim() || `Cetak (${printerName || 'Printer'})`;

		if (!image || !image.includes(',')) {
			logPrint('failed', 'Data gambar cetak tidak valid.', jobTitle);
			return json({ success: false, error: 'Data gambar cetak tidak valid.' }, { status: 400 });
		}

		if (!printerName) {
			logPrint('failed', 'Belum ada printer yang dipilih di Pengaturan.', 'Cetak gagal');
			return json(
				{ success: false, error: 'Belum ada printer dipilih di Pengaturan.' },
				{ status: 400 }
			);
		}

		const b64 = image.split(',')[1] || '';
		const buf = Buffer.from(b64, 'base64');
		if (buf.length === 0) {
			logPrint('failed', 'Berkas gambar cetak kosong.', jobTitle);
			return json({ success: false, error: 'Berkas gambar cetak kosong.' }, { status: 400 });
		}

		tempPath = path.join(
			os.tmpdir(),
			`distudio-print-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`
		);
		await fs.writeFile(tempPath, buf);

		try {
			const { stdout, stderr } = await execFileAsync(
				'powershell',
				['-NoProfile', '-Command', PRINT_SCRIPT],
				{
					timeout: 60000,
					maxBuffer: 1024 * 1024,
					env: {
						...process.env,
						DISTUDIO_PRINTER: printerName,
						DISTUDIO_IMG_PATH: tempPath,
						DISTUDIO_LAYOUT: layoutMode,
						DISTUDIO_SPLIT: splitMode,
						DISTUDIO_AUTOROTATE: autoRotate ? '1' : '0',
						DISTUDIO_COPIES: String(copies)
					}
				}
			);

			if (stderr && stderr.trim()) {
				const errText = stderr.trim().slice(0, 400);
				logPrint('failed', errText, `${jobTitle} gagal`);
				return json({ success: false, error: errText }, { status: 500 });
			}

			logPrint(
				'done',
				`Printer: ${printerName} · ${copies} salinan · layout ${layoutMode} · split ${splitMode}`,
				jobTitle
			);
			return json({ success: true, output: stdout.trim() });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logPrint('failed', msg.slice(0, 400), `${jobTitle} gagal`);
			return json({ success: false, error: msg }, { status: 500 });
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : 'Gagal memproses cetak.';
		logPrint('failed', msg.slice(0, 400), 'Cetak gagal');
		return json({ success: false, error: msg }, { status: 500 });
	} finally {
		if (tempPath) {
			await fs.unlink(tempPath).catch(() => undefined);
		}
	}
}
