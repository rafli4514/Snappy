/**
 * Timelapse GIF + MP4 — generate from session photos.
 * Frame-by-frame steady pace (+ optional crossfade).
 */

import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export type TimelapseTransition = 'none' | 'crossfade';

interface TimelapseOptions {
	width?: number;
	height?: number;
	/** Kecepatan putar: >1 lebih cepat, <1 lebih lambat. Default 1. */
	speedMul?: number;
	transition?: TimelapseTransition;
}

type RenderFrame =
	| { kind: 'solid'; img: HTMLImageElement; delayMs: number }
	| { kind: 'blend'; a: HTMLImageElement; b: HTMLImageElement; mix: number; delayMs: number };

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

function loadImg(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = url;
	});
}

function drawToCtx(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	w: number,
	h: number
): void {
	const srcAspect = img.naturalWidth / img.naturalHeight;
	const dstAspect = w / h;
	let sw: number, sh: number, sx: number, sy: number;
	if (srcAspect > dstAspect) {
		sh = img.naturalHeight;
		sw = sh * dstAspect;
		sx = (img.naturalWidth - sw) / 2;
		sy = 0;
	} else {
		sw = img.naturalWidth;
		sh = sw / dstAspect;
		sx = 0;
		sy = (img.naturalHeight - sh) / 2;
	}
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, w, h);
	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function renderToCtx(ctx: CanvasRenderingContext2D, w: number, h: number, rf: RenderFrame): void {
	if (rf.kind === 'blend') {
		ctx.save();
		drawToCtx(ctx, rf.a, w, h);
		ctx.globalAlpha = rf.mix;
		drawToCtx(ctx, rf.b, w, h);
		ctx.restore();
		ctx.globalAlpha = 1;
	} else {
		drawToCtx(ctx, rf.img, w, h);
	}
}

function buildRenderPlan(
	imgs: HTMLImageElement[],
	transition: TimelapseTransition,
	speedMul: number
): RenderFrame[] {
	const baseDelay = 900;
	const delayMs = Math.round(clamp(baseDelay / clamp(speedMul, 0.25, 2), 120, 2200));
	const xfadeFrames = transition === 'crossfade' ? 5 : 0;
	const xfadeDelay = Math.round(clamp(70 / Math.sqrt(clamp(speedMul, 0.25, 2)), 40, 120));

	const frames: RenderFrame[] = [];
	let last: HTMLImageElement | null = null;
	for (let i = 0; i < imgs.length; i++) {
		const img = imgs[i];
		if (xfadeFrames > 0 && last) {
			for (let x = 1; x <= xfadeFrames; x++) {
				frames.push({
					kind: 'blend',
					a: last,
					b: img,
					mix: x / (xfadeFrames + 1),
					delayMs: xfadeDelay
				});
			}
		}
		frames.push({ kind: 'solid', img, delayMs });
		last = img;
	}
	return frames;
}

function sampleForPalette(frames: ImageData[], maxSamples = 50000): Uint8ClampedArray {
	const total = frames.reduce((n, f) => n + f.data.length / 4, 0);
	const stride = Math.max(1, Math.floor(total / maxSamples));
	const out = new Uint8ClampedArray(Math.min(maxSamples, Math.ceil(total / stride)) * 4);
	let o = 0;
	let count = 0;
	for (const f of frames) {
		const d = f.data;
		for (let i = 0; i < d.length; i += 4 * stride) {
			if (o + 3 >= out.length) break;
			out[o++] = d[i];
			out[o++] = d[i + 1];
			out[o++] = d[i + 2];
			out[o++] = 255;
			count++;
		}
	}
	return out.subarray(0, count * 4);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const len = bytes.byteLength;
	const chunkSize = 8192;
	for (let i = 0; i < len; i += chunkSize) {
		const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
		binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
	}
	return btoa(binary);
}

function yieldToMain(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as string);
		r.onerror = reject;
		r.readAsDataURL(blob);
	});
}

async function prepare(
	photoUrls: string[],
	opts: TimelapseOptions
): Promise<{ plan: RenderFrame[]; W: number; H: number }> {
	const urls = (photoUrls || []).filter(Boolean);
	if (urls.length === 0) throw new Error('Tidak ada foto untuk timelapse');
	const transition = opts.transition ?? 'none';
	const speedMul = clamp(opts.speedMul ?? 1, 0.25, 2);
	const W = opts.width ?? 480;
	const H = opts.height ?? 360;
	const imgs: HTMLImageElement[] = [];
	for (const u of urls) imgs.push(await loadImg(u));
	return { plan: buildRenderPlan(imgs, transition, speedMul), W, H };
}

export async function buildTimelapseGif(
	photoUrls: string[],
	opts: TimelapseOptions = {}
): Promise<string> {
	const { plan, W, H } = await prepare(photoUrls, opts);
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D unavailable');

	const sampleFrames: ImageData[] = [];
	const sampleIdx =
		plan.length <= 6
			? plan.map((_, i) => i)
			: [
					0,
					Math.floor(plan.length * 0.25),
					Math.floor(plan.length * 0.5),
					Math.floor(plan.length * 0.75),
					plan.length - 1
				];
	for (const i of sampleIdx) {
		renderToCtx(ctx, W, H, plan[i]);
		sampleFrames.push(ctx.getImageData(0, 0, W, H));
	}
	const globalPalette = quantize(sampleForPalette(sampleFrames), 256);

	const gif = GIFEncoder();
	for (let i = 0; i < plan.length; i++) {
		renderToCtx(ctx, W, H, plan[i]);
		const frame = ctx.getImageData(0, 0, W, H);
		const index = applyPalette(frame.data, globalPalette);
		gif.writeFrame(index, W, H, { palette: globalPalette, delay: plan[i].delayMs });
		if (i % 10 === 9) await yieldToMain();
	}
	gif.finish();
	return `data:image/gif;base64,${bytesToBase64(gif.bytes())}`;
}

function pickMp4Mime(): string | null {
	if (typeof MediaRecorder === 'undefined') return null;
	const candidates = [
		'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
		'video/mp4;codecs=avc1.42E01E',
		'video/mp4;codecs=h264',
		'video/mp4'
	];
	for (const m of candidates) {
		try {
			if (MediaRecorder.isTypeSupported(m)) return m;
		} catch {
			/* ignore */
		}
	}
	return null;
}

function wait(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function buildMp4ViaMediaRecorder(
	plan: RenderFrame[],
	W: number,
	H: number
): Promise<string | null> {
	const mime = pickMp4Mime();
	if (!mime) return null;
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	const stream = canvas.captureStream(30);
	const chunks: Blob[] = [];
	let recorder: MediaRecorder;
	try {
		recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
	} catch {
		return null;
	}

	const done = new Promise<Blob | null>((resolve) => {
		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunks.push(e.data);
		};
		recorder.onerror = () => resolve(null);
		recorder.onstop = () => {
			if (!chunks.length) resolve(null);
			else resolve(new Blob(chunks, { type: 'video/mp4' }));
		};
	});

	recorder.start();
	for (const rf of plan) {
		renderToCtx(ctx, W, H, rf);
		await wait(rf.delayMs);
	}
	await wait(120);
	try {
		recorder.stop();
	} catch {
		/* ignore */
	}
	const blob = await done;
	if (!blob) return null;
	return blobToDataUrl(blob);
}

async function buildMp4ViaWebCodecs(
	plan: RenderFrame[],
	W: number,
	H: number
): Promise<string | null> {
	if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;

	// Ensure even dimensions (H.264 requirement in many encoders)
	const w = W % 2 === 0 ? W : W + 1;
	const h = H % 2 === 0 ? H : H + 1;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: false });
	if (!ctx) return null;

	const codecs = ['avc1.42001f', 'avc1.42E01E', 'avc1.4d001f', 'avc1.640028'];
	let chosen: string | null = null;
	for (const codec of codecs) {
		try {
			const support = await VideoEncoder.isConfigSupported({
				codec,
				width: w,
				height: h,
				bitrate: 1_200_000,
				framerate: 30
			});
			if (support.supported) {
				chosen = codec;
				break;
			}
		} catch {
			/* try next */
		}
	}
	if (!chosen) return null;

	let muxer: Muxer<ArrayBufferTarget>;
	try {
		muxer = new Muxer({
			target: new ArrayBufferTarget(),
			video: { codec: 'avc', width: w, height: h },
			fastStart: 'in-memory'
		});
	} catch (e) {
		console.warn('MP4 muxer init failed:', e);
		return null;
	}

	let encoderError: unknown = null;
	let encoder: VideoEncoder;
	try {
		encoder = new VideoEncoder({
			output: (chunk, meta) => {
				try {
					muxer.addVideoChunk(chunk, meta);
				} catch (e) {
					encoderError = encoderError || e;
				}
			},
			error: (e) => {
				encoderError = encoderError || e;
			}
		});
		encoder.configure({
			codec: chosen,
			width: w,
			height: h,
			bitrate: 1_200_000,
			framerate: 30
		});
	} catch (e) {
		console.warn('VideoEncoder init failed:', e);
		return null;
	}

	try {
		let timestamp = 0; // microseconds
		for (let i = 0; i < plan.length; i++) {
			const rf = plan[i];
			renderToCtx(ctx, w, h, rf);
			const durationUs = Math.max(33_000, Math.round(rf.delayMs * 1000));
			const frame = new VideoFrame(canvas, { timestamp, duration: durationUs });
			encoder.encode(frame, { keyFrame: i % 12 === 0 });
			frame.close();
			timestamp += durationUs;
			if (i % 6 === 5) await yieldToMain();
		}
		// hold last frame
		renderToCtx(ctx, w, h, plan[plan.length - 1]);
		const holdFrame = new VideoFrame(canvas, { timestamp, duration: 120_000 });
		encoder.encode(holdFrame, { keyFrame: false });
		holdFrame.close();

		await encoder.flush();
		encoder.close();
		if (encoderError) {
			console.warn('MP4 encode error:', encoderError);
			return null;
		}
		muxer.finalize();
		const { buffer } = muxer.target;
		if (!buffer || buffer.byteLength === 0) return null;
		const blob = new Blob([buffer], { type: 'video/mp4' });
		return blobToDataUrl(blob);
	} catch (e) {
		try {
			encoder.close();
		} catch {
			/* ignore */
		}
		console.warn('WebCodecs MP4 encode failed:', e);
		return null;
	}
}

/** Hasilkan video MP4 (data URL). Mengembalikan null jika MP4 tidak didukung. */
export async function buildTimelapseVideo(
	photoUrls: string[],
	opts: TimelapseOptions = {}
): Promise<string | null> {
	const { plan, W, H } = await prepare(photoUrls, opts);
	// 1) WebCodecs + mp4-muxer (Chromium/Edge modern, cepat/offline)
	const wc = await buildMp4ViaWebCodecs(plan, W, H);
	if (wc) return wc;
	// 2) MediaRecorder MP4 native (jika tersedia)
	const mr = await buildMp4ViaMediaRecorder(plan, W, H);
	if (mr) return mr;
	return null;
}
