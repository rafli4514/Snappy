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
 * then trigger window.print().
 *
 * Ukuran kertas dan kotak cetak diambil dari kanvas hasil render, bukan
 * angka tetap: setiap format punya rasio sendiri, dan memaksa semuanya
 * ke 4 × 6 inci membuat strip gepeng.
 */
export async function printStrip(
	photoDataUrls: string[],
	templateKey: TemplateArg,
	options: RenderOptions
): Promise<void> {
	const canvas = await renderExportCanvas(photoDataUrls, templateKey, options);

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

	// Convert to data URL for the img tag
	const dataUrl = canvas.toDataURL('image/png');
	const img = printLayout.querySelector('img');
	if (img) {
		img.src = dataUrl;
	}

	// Small delay to let the browser paint the image before printing
	await new Promise((r) => setTimeout(r, 100));
	window.print();
}
