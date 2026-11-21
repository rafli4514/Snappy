/**
 * Print endpoint
 * Uses PowerShell PrintDocument to send an image to a printer.
 *
 * POST /api/print
 * Body: { image, printerName, layoutMode, autoRotate, splitMode, bleed, offsetX, offsetY, copies }
 * Returns: { success: boolean, jobId?: string, error?: string }
 */

import { json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { enqueue } from '#lib/server/queueStore';

function logPrint(status: 'done' | 'failed' | 'skipped', detail: string, title = 'Print'): void {
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
	bleed?: number;
	offsetX?: number;
	offsetY?: number;
	copies?: number;
}

export async function POST({ request }: { request: Request }) {
	try {
		const body: PrintRequest = await request.json();
		const {
			image,
			printerName = '',
			layoutMode = 'fit',
			autoRotate = true,
			splitMode = 'none',
			bleed = 0,
			offsetX = 0,
			offsetY = 0,
			copies = 1
		} = body;

		if (!printerName) {
			logPrint('failed', 'Tidak ada printer dipilih.');
			return json(
				{ success: false, error: 'print_queue: No printer selected in settings!' },
				{ status: 400 }
			);
		}

		// Build PowerShell script for PrintDocument
		const psScript = buildPrintScript({
			image,
			printerName,
			layoutMode,
			autoRotate,
			splitMode,
			bleed,
			offsetX,
			offsetY,
			copies
		});

		try {
			const { stdout, stderr } = await execFileAsync(
				'powershell',
				['-NoProfile', '-Command', psScript],
				{
					timeout: 60000,
					maxBuffer: 1024 * 1024
				}
			);

			if (stderr) {
				logPrint('failed', stderr.trim().slice(0, 400), `Print gagal (${printerName})`);
				return json({ success: false, error: stderr.trim() }, { status: 500 });
			}

			logPrint(
				'done',
				`Printer: ${printerName} · copies: ${copies} · ${splitMode}`,
				`Print terkirim (${printerName})`
			);
			return json({ success: true, output: stdout.trim() });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logPrint('failed', msg.slice(0, 400), `Print gagal (${printerName})`);
			return json({ success: false, error: `PowerShell error: ${msg}` }, { status: 500 });
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		logPrint('failed', msg.slice(0, 400));
		return json({ success: false, error: msg }, { status: 500 });
	}
}

function buildPrintScript(opts: PrintRequest & { image: string }): string {
	const { image, printerName, layoutMode, autoRotate, splitMode, bleed, offsetX, offsetY, copies } =
		opts;

	// Decode data URL to base64 for PowerShell
	const b64 = image.split(',')[1] || '';

	return `
$ErrorActionPreference = 'Stop'
$Printer = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq '${printerName}' }
if (-not $Printer) { throw "Printer '${printerName}' not found on this system" }
if ($Printer.WorkOffline -or $Printer.PrinterStatus -eq 7) { throw 'Printer is Offline' }
if (@(4,7,8,9) -contains $Printer.DetectedErrorState) { throw "Printer Error: State $($Printer.DetectedErrorState)" }

# Create print document
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = '${printerName}'
$doc.PrinterSettings.Copies = ${copies}

# Draw image with layout mode
function DrawWithLayout($g, $img, $rect, $mode) {
    $imRatio = $img.Width / $img.Height
    $rectRatio = $rect.Width / $rect.Height
    switch ($mode) {
        'stretch' { $g.DrawImage($img, $rect) }
        'fit' {
            if ($imRatio -gt $rectRatio) {
                $drawW = $rect.Width
                $drawH = $rect.Width / $imRatio
            } else {
                $drawH = $rect.Height
                $drawW = $rect.Height * $imRatio
            }
            $x = $rect.X + ($rect.Width - $drawW) / 2
            $y = $rect.Y + ($rect.Height - $drawH) / 2
            $g.DrawImage($img, [System.Drawing.Rectangle]::FromLTRB($x, $y, $x + $drawW, $y + $drawH))
        }
        'fill' {
            # Cover + center-crop
            if ($imRatio -gt $rectRatio) {
                $srcW = $img.Height * $rectRatio
                $srcH = $img.Height
            } else {
                $srcW = $img.Width
                $srcH = $img.Width / $rectRatio
            }
            $srcX = ($img.Width - $srcW) / 2
            $srcY = ($img.Height - $srcH) / 2
            $g.DrawImage($img, $rect, $srcX, $srcY, $srcW, $srcH, [System.Drawing.GraphicsUnit]::Pixel)
        }
    }
}

# Geometry
$targetX = ${offsetX}
$targetY = ${offsetY}
$targetW = ${splitMode === '2-strip' ? '([Math]::Floor([System.Drawing.Printing.PageSettings]::PaperSize.Width / 2))' : '[System.Drawing.Printing.PageSettings]::PaperSize.Width'}
$targetH = ${'[System.Drawing.Printing.PageSettings]::PaperSize.Height'}

# Convert base64 image
$imgBytes = [Convert]::FromBaseString('${b64}')
$ms = New-Object System.IO.MemoryStream($imgBytes)
$img = [System.Drawing.Image]::FromStream($ms)

# Auto-rotate if needed
${autoRotate ? '$if ($img.Width -gt $img.Height -and $targetW -lt $targetH) -or ($img.Height -gt $img.Width -and $targetW -gt $targetH) { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }' : ''}

$doc.PrintPage += {
    param($sender, $e)
    $g = $e.Graphics
    ${
			splitMode === '2-strip'
				? `
    $halfW = [Math]::Floor($e.PageBounds.Width / 2)
    DrawWithLayout $g $img ([System.Drawing.Rectangle]::new($e.PageBounds.X, $e.PageBounds.Y, $halfW, $e.PageBounds.Height), '${layoutMode}')
    DrawWithLayout $g $img ([System.Drawing.Rectangle]::new($e.PageBounds.X + $halfW, $e.PageBounds.Y, $halfW, $e.PageBounds.Height), '${layoutMode}')
    `
				: `DrawWithLayout $g $img $e.PageBounds '${layoutMode}'`
		}
}

$doc.Print()
$ms.Close()
$img.Dispose()
`.replace(/\$\$/g, '$'); // escape literal $ signs
}
