import path from 'node:path';
import { CACHE_DIR, readCacheJson, writeCacheJson } from './cacheDir';

export type QueueType = 'cloud-sync' | 'print' | 'upload';
export type QueueStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped';

interface QueueItem {
	id: string;
	type: QueueType;
	status: QueueStatus;
	title: string;
	ref?: string;
	detail?: string;
	source?: string;
	createdAt: string;
	updatedAt: string;
}

const FILE = path.join(CACHE_DIR, '_queue.json');

function readAll(): QueueItem[] {
	const data = readCacheJson<unknown>(FILE, []);
	return Array.isArray(data) ? (data as QueueItem[]) : [];
}

function writeAll(items: QueueItem[]): void {
	writeCacheJson(FILE, items.slice(0, 500));
}

function uid(): string {
	return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function listQueue(type?: QueueType): QueueItem[] {
	const items = readAll().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
	return type ? items.filter((x) => x.type === type) : items;
}

export function enqueue(input: {
	type: QueueType;
	status?: QueueStatus;
	title: string;
	ref?: string;
	detail?: string;
	source?: string;
}): QueueItem {
	const now = new Date().toISOString();
	const item: QueueItem = {
		id: uid(),
		type: input.type,
		status: input.status ?? 'pending',
		title: (input.title || input.type).slice(0, 140),
		ref: input.ref?.slice(0, 200),
		detail: input.detail?.slice(0, 500),
		source: input.source?.slice(0, 80),
		createdAt: now,
		updatedAt: now
	};
	const items = readAll();
	items.unshift(item);
	writeAll(items);
	return item;
}

export function updateQueue(
	id: string,
	patch: Partial<Pick<QueueItem, 'status' | 'detail' | 'title'>>
): QueueItem | null {
	const items = readAll();
	const idx = items.findIndex((x) => x.id === id);
	if (idx < 0) return null;
	items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() };
	writeAll(items);
	return items[idx];
}

export function removeQueue(id: string): boolean {
	const items = readAll();
	const next = items.filter((x) => x.id !== id);
	if (next.length === items.length) return false;
	writeAll(next);
	return true;
}

export function clearQueue(type?: QueueType | 'all'): number {
	const items = readAll();
	let next = items;
	if (type && type !== 'all') next = items.filter((x) => x.type !== type);
	else if (type === 'all' || !type) next = [];
	const removed = items.length - next.length;
	writeAll(next);
	return removed;
}

export function summarizeQueue(): Record<
	QueueType,
	{ total: number; pending: number; failed: number; done: number }
> {
	const base = () => ({ total: 0, pending: 0, failed: 0, done: 0 });
	const out: Record<QueueType, ReturnType<typeof base>> = {
		'cloud-sync': base(),
		print: base(),
		upload: base()
	};
	for (const item of readAll()) {
		const s = out[item.type];
		if (!s) continue;
		s.total++;
		if (item.status === 'pending' || item.status === 'processing') s.pending++;
		if (item.status === 'failed') s.failed++;
		if (item.status === 'done') s.done++;
	}
	return out;
}
