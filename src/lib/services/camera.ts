/**
 * Camera Utility — manages MediaStream lifecycle
 * All camera track management is centralized here.
 */

type FacingMode = 'user' | 'environment';

let activeStream: MediaStream | null = null;

/** Current facing mode */
let currentFacingMode: FacingMode = 'user';

/** Start the camera with a given facing mode (mobile-safe with constraint fallbacks). */
export async function startCamera(facingMode: FacingMode = 'user'): Promise<MediaStream> {
	// Stop any existing stream first
	stopCamera();
	currentFacingMode = facingMode;

	if (
		typeof navigator === 'undefined' ||
		!navigator.mediaDevices ||
		typeof navigator.mediaDevices.getUserMedia !== 'function'
	) {
		const err = new Error('Akses kamera membutuhkan koneksi aman (HTTPS atau localhost).');
		err.name = 'InsecureContextError';
		throw err;
	}

	const attempts: MediaStreamConstraints[] = [
		{
			video: {
				facingMode: { ideal: facingMode },
				width: { ideal: 1280 },
				height: { ideal: 960 }
			},
			audio: false
		},
		{
			video: { facingMode: { ideal: facingMode } },
			audio: false
		},
		{
			video: true,
			audio: false
		}
	];

	let lastErr: unknown = null;
	for (let i = 0; i < attempts.length; i++) {
		try {
			const stream = await navigator.mediaDevices.getUserMedia(attempts[i]);
			activeStream = stream;
			return stream;
		} catch (err: unknown) {
			lastErr = err;
			const name =
				typeof err === 'object' && err !== null ? ((err as { name?: string }).name ?? '') : '';
			// Permission denied / hardware busy won't be fixed by relaxing constraints
			if (
				name === 'NotAllowedError' ||
				name === 'PermissionDeniedError' ||
				name === 'NotReadableError' ||
				name === 'TrackStartError'
			) {
				activeStream = null;
				throw err;
			}
		}
	}

	activeStream = null;
	throw lastErr;
}

/** Stop all active camera tracks. */
export function stopCamera(): void {
	if (activeStream) {
		activeStream.getTracks().forEach((track) => track.stop());
		activeStream = null;
	}
}

/** Switch between front and rear camera. */
export async function switchCamera(): Promise<MediaStream> {
	const next: FacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
	return startCamera(next);
}

/**
 * Check if the device supports multiple cameras.
 * IMPORTANT: Never open a second getUserMedia() stream while activeStream is running —
 * on iOS Safari and many Android devices, a concurrent getUserMedia kills or locks the live stream.
 */
export async function hasMultipleCameras(): Promise<boolean> {
	try {
		if (
			typeof navigator === 'undefined' ||
			!navigator.mediaDevices ||
			typeof navigator.mediaDevices.enumerateDevices !== 'function'
		) {
			return false;
		}

		// Enumerate directly (permission is already granted by startCamera())
		const devices = await navigator.mediaDevices.enumerateDevices();
		const videoCams = devices.filter((d) => d.kind === 'videoinput');
		if (videoCams.length <= 1) {
			return false;
		}

		// Filter kamera virtual / sensor tambahan bila label tersedia
		const realCameras = videoCams.filter((cam) => {
			const label = (cam.label || '').toLowerCase();
			if (!label) return true;
			const isVirtual =
				label.includes('virtual') ||
				label.includes('obs') ||
				label.includes('camo') ||
				label.includes('iriun') ||
				label.includes('droidcam');
			const isSensor = label.includes('ir') || label.includes('depth');

			return !isVirtual && !isSensor;
		});

		const uniqueKeys = new Set(
			realCameras.map((d, idx) => (d.deviceId ? d.deviceId : `cam-${idx}`))
		);
		return uniqueKeys.size > 1;
	} catch {
		return false;
	}
}

/** Attach stream to a video element. */
export function attachStream(videoEl: HTMLVideoElement, stream: MediaStream): Promise<void> {
	videoEl.srcObject = stream;
	videoEl.muted = true;
	videoEl.playsInline = true;
	return videoEl.play().catch(() => {
		// Safari may require user interaction — handled in component
	});
}

/**
 * Map a media error to a user-facing key. Works for Error and DOMException
 * (getUserMedia throws DOMException, which does not inherit from Error).
 */
export function getCameraErrorMessage(err: unknown): string {
	const name =
		typeof err === 'object' && err !== null ? ((err as { name?: string }).name ?? '') : '';

	switch (name) {
		case 'InsecureContextError':
			return 'https_required';
		case 'NotAllowedError':
		case 'PermissionDeniedError':
			return 'permission_denied';
		case 'NotFoundError':
		case 'DevicesNotFoundError':
			return 'no_camera';
		case 'NotReadableError':
		case 'TrackStartError':
			return 'camera_busy';
		case 'OverconstrainedError':
			return 'overconstrained';
		default:
			if (typeof window !== 'undefined' && !window.isSecureContext) {
				return 'https_required';
			}
			return 'unknown';
	}
}

// Safety net: stop camera on page unload
if (typeof window !== 'undefined') {
	window.addEventListener('beforeunload', stopCamera);
}
