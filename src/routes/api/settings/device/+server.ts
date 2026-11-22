import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getDeviceConfig,
	saveDeviceConfig,
	type PrintDeviceConfig
} from '#lib/server/deviceConfigStore';

export const GET: RequestHandler = () => {
	return json({ ok: true, config: getDeviceConfig() });
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Partial<PrintDeviceConfig> | null;
		const config = saveDeviceConfig(body ?? {});
		return json({ ok: true, config });
	} catch {
		return json({ ok: false, error: 'Gagal menyimpan konfigurasi printer.' }, { status: 500 });
	}
};
