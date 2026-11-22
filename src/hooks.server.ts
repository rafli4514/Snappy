import type { Handle } from '@sveltejs/kit/hooks';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BACKEND_URL = (process.env.DISTUDIO_BACKEND_URL || 'http://127.0.0.1:3001').replace(
	/\/+$/,
	''
);
const DISABLE_RUST_PROXY = process.env.DISTUDIO_DISABLE_RUST_PROXY === '1';

const HOP_BY_HOP_HEADERS = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'expect',
	'host',
	'content-length'
]);

let backendHealthy = false;
let ensureInFlight: Promise<boolean> | null = null;

async function pingHealth(timeoutMs = 700): Promise<boolean> {
	try {
		const res = await fetch(`${BACKEND_URL}/api/health`, {
			signal: AbortSignal.timeout(timeoutMs)
		});
		return res.ok;
	} catch {
		return false;
	}
}

function findServerBinary(): string | null {
	const exe = process.platform === 'win32' ? 'distudio-server.exe' : 'distudio-server';
	const candidates = [
		path.resolve('backend', 'target', 'release', exe),
		path.resolve('backend', 'target', 'debug', exe)
	];
	for (const p of candidates) {
		if (fs.existsSync(p)) return p;
	}
	return null;
}

async function ensureRustBackend(): Promise<boolean> {
	if (backendHealthy) return true;
	if (ensureInFlight) return ensureInFlight;

	ensureInFlight = (async () => {
		if (await pingHealth(600)) {
			backendHealthy = true;
			return true;
		}

		const bin = findServerBinary();
		if (!bin) {
			return false;
		}

		try {
			const child = spawn(bin, [], {
				cwd: process.cwd(),
				detached: true,
				windowsHide: true,
				stdio: 'ignore',
				env: {
					...process.env,
					DISTUDIO_PORT: new URL(BACKEND_URL).port || '3001',
					DISTUDIO_HOST: '127.0.0.1'
				}
			});
			child.unref();
		} catch {
			return false;
		}

		const deadline = Date.now() + 8000;
		while (Date.now() < deadline) {
			if (await pingHealth(500)) {
				backendHealthy = true;
				return true;
			}
			await new Promise((r) => setTimeout(r, 150));
		}

		return false;
	})().finally(() => {
		ensureInFlight = null;
	});

	return ensureInFlight;
}

export const handle: Handle = async ({ event, resolve }) => {
	if (DISABLE_RUST_PROXY || !event.url.pathname.startsWith('/api/')) {
		return resolve(event);
	}

	const ready = await ensureRustBackend();
	if (!ready) {
		return resolve(event);
	}

	const targetUrl = `${BACKEND_URL}${event.url.pathname}${event.url.search}`;
	const reqHeaders = new Headers();
	event.request.headers.forEach((val, key) => {
		if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
			reqHeaders.set(key, val);
		}
	});
	reqHeaders.set('accept-encoding', 'identity');
	reqHeaders.set('x-forwarded-host', event.url.host);
	reqHeaders.set('x-forwarded-proto', event.url.protocol.replace(/:$/, ''));

	const method = event.request.method.toUpperCase();
	const bodyBuf =
		method === 'GET' || method === 'HEAD' ? undefined : await event.request.arrayBuffer();

	const doProxy = () =>
		fetch(targetUrl, {
			method,
			headers: reqHeaders,
			body: bodyBuf && bodyBuf.byteLength > 0 ? bodyBuf : undefined,
			redirect: 'manual'
		});

	let upstream: Response;
	try {
		upstream = await doProxy();
	} catch {
		backendHealthy = false;
		if (!(await ensureRustBackend())) {
			return resolve(event);
		}
		upstream = await doProxy();
	}

	const resHeaders = new Headers();
	upstream.headers.forEach((val, key) => {
		const lower = key.toLowerCase();
		if (lower !== 'transfer-encoding' && lower !== 'connection' && lower !== 'set-cookie') {
			resHeaders.set(key, val);
		}
	});
	const setCookies =
		typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
	for (const cookie of setCookies) {
		resHeaders.append('set-cookie', cookie);
	}

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: resHeaders
	});
};
