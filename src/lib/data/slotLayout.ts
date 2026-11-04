/**
 * Tata letak slot bawaan — koordinat ternormalisasi 0..1 untuk 1–6 foto.
 * Dipakai builder template baru sebagai titik awal yang rapi, bukan sebagai
 * preset siap pakai (preset kertas tinggal di `TEMPLATES`).
 */

import type { CustomSlot } from '#lib/types';

/** Generate normalized slot coordinates based on photo count (1 to 6). */
export function generateSlots(photoCount: number): CustomSlot[] {
	const count = Math.min(6, Math.max(1, photoCount));
	const slots: CustomSlot[] = [];

	if (count === 1) {
		slots.push({
			id: 'slot-1',
			name: '1',
			type: 'rect',
			x: 0.08,
			y: 0.12,
			width: 0.84,
			height: 0.76,
			borderRadius: 12,
			assignedPhotoIndex: 0,
			scale: 1.0,
			offsetX: 0,
			offsetY: 0
		});
		return slots;
	}

	if (count === 2) {
		slots.push(
			{
				id: 'slot-1',
				name: '1',
				type: 'rect',
				x: 0.12,
				y: 0.06,
				width: 0.76,
				height: 0.38,
				borderRadius: 8,
				assignedPhotoIndex: 0,
				scale: 1.0,
				offsetX: 0,
				offsetY: 0
			},
			{
				id: 'slot-2',
				name: '2',
				type: 'rect',
				x: 0.12,
				y: 0.52,
				width: 0.76,
				height: 0.38,
				borderRadius: 8,
				assignedPhotoIndex: 1,
				scale: 1.0,
				offsetX: 0,
				offsetY: 0
			}
		);
		return slots;
	}

	if (count === 3) {
		const h = 0.26;
		const gap = 0.04;
		const startY = 0.06;
		for (let i = 0; i < 3; i++) {
			slots.push({
				id: `slot-${i + 1}`,
				name: `${i + 1}`,
				type: 'rect',
				x: 0.12,
				y: startY + i * (h + gap),
				width: 0.76,
				height: h,
				borderRadius: 8,
				assignedPhotoIndex: i,
				scale: 1.0,
				offsetX: 0,
				offsetY: 0
			});
		}
		return slots;
	}

	if (count === 4) {
		const h = 0.2;
		const gap = 0.025;
		const startY = 0.05;
		for (let i = 0; i < 4; i++) {
			slots.push({
				id: `slot-${i + 1}`,
				name: `${i + 1}`,
				type: 'rect',
				x: 0.12,
				y: startY + i * (h + gap),
				width: 0.76,
				height: h,
				borderRadius: 6,
				assignedPhotoIndex: i,
				scale: 1.0,
				offsetX: 0,
				offsetY: 0
			});
		}
		return slots;
	}

	// 5 or 6 slots
	const h = 0.14;
	const gap = 0.018;
	const startY = 0.035;
	for (let i = 0; i < count; i++) {
		slots.push({
			id: `slot-${i + 1}`,
			name: `${i + 1}`,
			type: 'rect',
			x: 0.12,
			y: startY + i * (h + gap),
			width: 0.76,
			height: h,
			borderRadius: 6,
			assignedPhotoIndex: i,
			scale: 1.0,
			offsetX: 0,
			offsetY: 0
		});
	}
	return slots;
}
