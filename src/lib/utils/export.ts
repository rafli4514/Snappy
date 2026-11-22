/**
 * Export Utility — PNG download and print trigger
 */

import { renderExportCanvas } from './canvas';
import type { CustomTemplate, RenderOptions } from '#lib/types';

type TemplateArg = string | CustomTemplate;

/** Download the photo strip as a PNG file. */
export async function downloadStripPNG(
	photoDataUrls: string[],
	templateKey: TemplateArg,
	options: RenderOptions
): Promise<void> {
	const canvas = await renderExportCanvas(photoDataUrls, templateKey, options);

	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error('Failed to generate PNG blob'));
				return;
			}
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			const timestamp = new Date()
				.toISOString()
				.replace(/[:\-T]/g, '')
				.slice(0, 15);
			a.href = url;
			a.download = `distudio-strip-${timestamp}.png`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			resolve();
		}, 'image/png');
	});
}

/** Kanvas ekspor selalu px 300 DPI, jadi inci = px / 300. */
const PRINT_DPI = 300;

/**
 * Prepare the hidden #print-layout element with the export image,
 * then trigger direct Windows print (when configured) or window.print().
 */
export async function printStrip(
	photoDataUrls: string[],
	templateKey: TemplateArg,
	options: RenderOptions
): Promise<void> {
	const canvas = await renderExportCanvas(photoDataUrls, templateKey, options);
	const dataUrl = canvas.toDataURL('image/png');

	// Cek konfigurasi cetak perangkat di server (bila mode direct aktif)
	interface DevicePrintConfig {
		printMode?: 'browser' | 'direct';
		printerName?: string;
		layoutMode?: 'fit' | 'fill' | 'stretch';
		splitMode?: 'none' | '2-strip';
		autoRotate?: boolean;
		copies?: number;
		fallbackToBrowser?: boolean;
	}

	let cfg: DevicePrintConfig | null = null;

	try {
		const res = await fetch('/api/settings/device');
		if (res.ok) {
			const data = (await res.json()) as { ok?: boolean; config?: DevicePrintConfig };
			if (data?.ok && data.config) cfg = data.config;
		}
	} catch {
		// abaikan — lanjut pakai dialog browser
	}

	if (cfg?.printMode === 'direct' && cfg.printerName) {
		try {
			const res = await fetch('/api/print', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					image: dataUrl,
					printerName: cfg.printerName,
					layoutMode: cfg.layoutMode ?? 'fit',
					splitMode: cfg.splitMode ?? 'none',
					autoRotate: cfg.autoRotate ?? true,
					copies: cfg.copies ?? 1
				})
			});
			const out = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
			if (res.ok && out.success) return;
			if (!cfg.fallbackToBrowser) {
				throw new Error(out.error || 'Gagal mencetak ke printer Windows.');
			}
		} catch (err) {
			if (!cfg.fallbackToBrowser) throw err;
		}
	}

	const printLayout = document.getElementById('print-layout');
	if (!printLayout) {
		throw new Error('#print-layout element not found in DOM');
	}

	const wIn = canvas.width / PRINT_DPI;
	const hIn = canvas.height / PRINT_DPI;
	printLayout.style.setProperty('--print-w', `${wIn.toFixed(3)}in`);
	printLayout.style.setProperty('--print-h', `${hIn.toFixed(3)}in`);

	// @page harus ikut ukuran lembar; kalau tidak, browser menskalakan isi.
	let pageSizeStyle = document.getElementById('print-run-size') as HTMLStyleElement | null;
	if (!pageSizeStyle) {
		pageSizeStyle = document.createElement('style');
		pageSizeStyle.id = 'print-run-size';
		document.head.appendChild(pageSizeStyle);
	}
	pageSizeStyle.textContent = `@page { size: ${wIn.toFixed(3)}in ${hIn.toFixed(3)}in; margin: 0; }`;

	const img = printLayout.querySelector('img');
	if (img) {
		img.src = dataUrl;
	}

	// Catat log cetak dialog browser (non-blocking)
	void fetch('/api/queue', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			type: 'print',
			status: 'done',
			title: 'Cetak via Dialog Browser',
			detail: `Ukuran ${canvas.width} × ${canvas.height} px (${wIn.toFixed(1)} × ${hIn.toFixed(1)} in)`,
			source: 'browser-print'
		})
	}).catch(() => undefined);

	// Small delay to let the browser paint the image before printing
	await new Promise((r) => setTimeout(r, 100));
	window.print();
}
