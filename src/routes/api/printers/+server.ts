import { json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RequestHandler } from './$types';

const execFileAsync = promisify(execFile);

export interface DetectedPrinter {
	name: string;
	isDefault: boolean;
	status: 'online' | 'offline' | 'error';
}

type RawWinPrinter = {
	Name?: string;
	Default?: boolean;
	WorkOffline?: boolean;
	PrinterStatus?: number;
	DetectedErrorState?: number;
};

function mapPrinter(raw: RawWinPrinter): DetectedPrinter | null {
	const name = String(raw?.Name ?? '').trim();
	if (!name) return null;
	const errState = Number(raw.DetectedErrorState ?? 0);
	const statusCode = Number(raw.PrinterStatus ?? 0);
	let status: DetectedPrinter['status'] = 'online';
	if ([4, 7, 8, 9].includes(errState)) {
		status = 'error';
	} else if (raw.WorkOffline || statusCode === 7) {
		status = 'offline';
	}
	return {
		name,
		isDefault: Boolean(raw.Default),
		status
	};
}

export const GET: RequestHandler = async () => {
	if (process.platform !== 'win32') {
		return json({ ok: true, supported: false, printers: [] as DetectedPrinter[] });
	}

	const ps =
		'Get-CimInstance Win32_Printer | Select-Object Name, Default, WorkOffline, PrinterStatus, DetectedErrorState | ConvertTo-Json -Compress';

	try {
		const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', ps], {
			timeout: 8000,
			maxBuffer: 512 * 1024
		});
		const trimmed = stdout.trim();
		if (!trimmed) {
			return json({ ok: true, supported: true, printers: [] as DetectedPrinter[] });
		}
		const parsed = JSON.parse(trimmed) as RawWinPrinter | RawWinPrinter[];
		const list = Array.isArray(parsed) ? parsed : [parsed];
		const printers = list
			.map(mapPrinter)
			.filter((p): p is DetectedPrinter => p !== null)
			.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));

		return json({ ok: true, supported: true, printers });
	} catch (err) {
		return json({
			ok: true,
			supported: true,
			printers: [] as DetectedPrinter[],
			error: err instanceof Error ? err.message : 'Gagal membaca daftar printer Windows.'
		});
	}
};
