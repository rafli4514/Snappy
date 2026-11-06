/**
 * Funcam Booth — Seed Frame Data
 * 24 frames (IDs 2–25) at 591×1772 canvas.
 * Slots are normalized 0..1 from the 591×1772 space.
 * Source: funcambooth.exe v0.7.8.0 seed JSON §3 spec.
 */

export interface FuncamSlot {
	name: string;
	/** px top-left X on 591×1772 canvas (can be negative) */
	x: number;
	/** px top-left Y on 591×1772 canvas */
	y: number;
	/** px width */
	w: number;
	/** px height */
	h: number;
	/** rotation degrees, 0 = upright */
	rotation: number;
}

export interface FuncamFrame {
	id: number;
	category: 'Cartoon' | 'Modern' | 'Music' | 'Newspaper';
	name: string;
	/** Slot count (2, 3 or 4). Never a fixed value. */
	photoCount: number;
	slots: FuncamSlot[];
}

/** Normalize a slot from 591×1772 px to 0..1 space for CustomSlot. */
export function toNormalizedSlot(slot: FuncamSlot): import('#lib/types').CustomSlot {
	return {
		id: '',
		name: slot.name,
		type: 'rect',
		x: slot.x / 591,
		y: slot.y / 1772,
		width: slot.w / 591,
		height: slot.h / 1772,
		rotation: slot.rotation,
		borderRadius: 0,
		assignedPhotoIndex: null,
		scale: 1.0,
		offsetX: 0,
		offsetY: 0
	};
}

export const FUNCAM_FRAMES: FuncamFrame[] = [
	{
		id: 2,
		category: 'Cartoon',
		name: 'Cute Brown Hirono',
		photoCount: 2,
		slots: [
			{ name: '#1', x: 96, y: 107, w: 386, h: 492, rotation: 0 },
			{ name: '#2', x: 96, y: 1167, w: 384, h: 495, rotation: 0 }
		]
	},
	{
		id: 3,
		category: 'Modern',
		name: 'Camera Style Strip',
		photoCount: 4,
		slots: [
			{ name: '#1', x: -10, y: 58, w: 610, h: 378.03, rotation: 0 },
			{ name: '#2', x: -10, y: 435.36, w: 610, h: 378.04, rotation: 0 },
			{ name: '#3', x: -12.05, y: 812.73, w: 610, h: 386.24, rotation: 0 },
			{ name: '#4', x: -12.05, y: 1198.97, w: 610, h: 395.84, rotation: 0 }
		]
	},
	{
		id: 4,
		category: 'Modern',
		name: 'White Message Strip',
		photoCount: 2,
		slots: [
			{ name: '#1', x: 93, y: 151, w: 420, h: 566, rotation: 0 },
			{ name: '#2', x: 93, y: 802, w: 420, h: 566, rotation: 0 }
		]
	},
	{
		id: 5,
		category: 'Newspaper',
		name: 'Photo Series',
		photoCount: 4,
		slots: [
			{ name: '#1', x: 17, y: 263, w: 558, h: 353, rotation: 0 },
			{ name: '#2', x: 17, y: 625, w: 559, h: 353, rotation: 0 },
			{ name: '#3', x: 18, y: 987, w: 558, h: 353, rotation: 0 },
			{ name: '#4', x: 18, y: 1352, w: 558, h: 353, rotation: 0 }
		]
	},
	{
		id: 6,
		category: 'Cartoon',
		name: 'Toy story pattern',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 63, y: 84, w: 465, h: 297, rotation: 0 },
			{ name: '#2', x: 63, y: 537, w: 465, h: 296, rotation: 0 },
			{ name: '#3', x: 63, y: 989, w: 465, h: 296, rotation: 0 }
		]
	},
	{
		id: 7,
		category: 'Cartoon',
		name: 'Black White Hirono',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 85.7, y: 110.89, w: 380.99, h: 284.44, rotation: 6.19 },
			{ name: '#2', x: 66.5, y: 664.7, w: 370, h: 286.25, rotation: -5.91 },
			{ name: '#3', x: 85.71, y: 1155.55, w: 373.8, h: 284.41, rotation: 6.45 }
		]
	},
	{
		id: 8,
		category: 'Modern',
		name: 'Gallery Style Strip',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 23, y: 143, w: 545, h: 425, rotation: 0 },
			{ name: '#2', x: 23, y: 570, w: 545, h: 425, rotation: 0 },
			{ name: '#3', x: 23, y: 996, w: 545, h: 426, rotation: 0 }
		]
	},
	{
		id: 9,
		category: 'Newspaper',
		name: 'Breaking News',
		photoCount: 4,
		slots: [
			{ name: '#1', x: 28, y: 196, w: 532, h: 366, rotation: 0 },
			{ name: '#2', x: 28, y: 571, w: 532, h: 365, rotation: 0 },
			{ name: '#3', x: 28, y: 945, w: 532, h: 365, rotation: 0 },
			{ name: '#4', x: 28, y: 1319, w: 532, h: 365, rotation: 0 }
		]
	},
	{
		id: 10,
		category: 'Cartoon',
		name: 'Toy story',
		photoCount: 2,
		slots: [
			{ name: '#1', x: 48.02, y: 158.22, w: 450.23, h: 451.84, rotation: -4.47 },
			{ name: '#2', x: 81.37, y: 832.75, w: 455.94, h: 453.4, rotation: 3.14 }
		]
	},
	{
		id: 11,
		category: 'Modern',
		name: 'Dark Mode Gallery',
		photoCount: 4,
		slots: [
			{ name: '#1', x: 22, y: 33, w: 550, h: 355, rotation: 0 },
			{ name: '#2', x: 18, y: 382, w: 550, h: 355, rotation: 0 },
			{ name: '#3', x: 20, y: 733, w: 550, h: 355, rotation: 0 },
			{ name: '#4', x: 22, y: 1083, w: 550, h: 356, rotation: 0 }
		]
	},
	{
		id: 12,
		category: 'Cartoon',
		name: 'Cute Green Hirono',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 72.78, y: 40.48, w: 471, h: 375.08, rotation: 4.16 },
			{ name: '#2', x: 43.05, y: 615.16, w: 471.9, h: 367.18, rotation: -4.93 },
			{ name: '#3', x: 77.6, y: 1087.19, w: 480.65, h: 374.5, rotation: 7.17 }
		]
	},
	{
		id: 13,
		category: 'Modern',
		name: 'Gallery Style Strip Landscape',
		photoCount: 4,
		slots: [
			{ name: '#1', x: 25, y: 33, w: 490, h: 422, rotation: 0 },
			{ name: '#2', x: 25, y: 465, w: 490, h: 422, rotation: 0 },
			{ name: '#3', x: 25, y: 894, w: 490, h: 422, rotation: 0 },
			{ name: '#4', x: 25, y: 1325, w: 490, h: 422, rotation: 0 }
		]
	},
	{
		id: 14,
		category: 'Newspaper',
		name: 'Photostrip',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 29, y: 307, w: 531, h: 416, rotation: 0 },
			{ name: '#2', x: 29, y: 735, w: 531, h: 416, rotation: 0 },
			{ name: '#3', x: 29, y: 1164, w: 531, h: 415, rotation: 0 }
		]
	},
	{
		id: 15,
		category: 'Cartoon',
		name: 'Buzzlightyear Pattern',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 42, y: 77, w: 506, h: 358, rotation: 0 },
			{ name: '#2', x: 42, y: 535, w: 506, h: 359, rotation: 0 },
			{ name: '#3', x: 42, y: 994, w: 506, h: 359, rotation: 0 }
		]
	},
	{
		id: 16,
		category: 'Modern',
		name: 'Dark Mode Gallery',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 18, y: 269, w: 557, h: 384, rotation: 0 },
			{ name: '#2', x: 16, y: 744, w: 557, h: 383, rotation: 0 },
			{ name: '#3', x: 16, y: 1218, w: 557, h: 384, rotation: 0 }
		]
	},
	{
		id: 17,
		category: 'Cartoon',
		name: 'Cute Blue Hirono',
		photoCount: 2,
		slots: [
			{ name: '#1', x: 91, y: 119, w: 405, h: 556, rotation: 0 },
			{ name: '#2', x: 91, y: 1113, w: 405, h: 557, rotation: 0 }
		]
	},
	{
		id: 18,
		category: 'Modern',
		name: 'Gallery Style Strip',
		photoCount: 4,
		slots: [
			{ name: '#1', x: 20, y: 242, w: 550, h: 366, rotation: 0 },
			{ name: '#2', x: 20, y: 600, w: 550, h: 365, rotation: 0 },
			{ name: '#3', x: 20, y: 957, w: 550, h: 366, rotation: 0 },
			{ name: '#4', x: 20, y: 1315, w: 550, h: 366, rotation: 0 }
		]
	},
	{
		id: 19,
		category: 'Newspaper',
		name: 'Comming Soon',
		photoCount: 4,
		slots: [
			{ name: '#1', x: 17, y: 341, w: 556, h: 319, rotation: 0 },
			{ name: '#2', x: 17, y: 675, w: 556, h: 318, rotation: 0 },
			{ name: '#3', x: 17, y: 1007, w: 556, h: 319, rotation: 0 },
			{ name: '#4', x: 17, y: 1341, w: 556, h: 319, rotation: 0 }
		]
	},
	{
		id: 20,
		category: 'Cartoon',
		name: 'Cute Lotso',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 60, y: 52, w: 470, h: 419, rotation: 0 },
			{ name: '#2', x: 60, y: 548, w: 470, h: 419, rotation: 0 },
			{ name: '#3', x: 60, y: 1015, w: 470, h: 419, rotation: 0 }
		]
	},
	{
		id: 21,
		category: 'Modern',
		name: 'Gallery Style Strip Landscape',
		photoCount: 4,
		slots: [
			{ name: '#1', x: 22, y: 20, w: 458, h: 432, rotation: 0 },
			{ name: '#2', x: 22, y: 453, w: 458, h: 433, rotation: 0 },
			{ name: '#3', x: 22, y: 886, w: 458, h: 432, rotation: 0 },
			{ name: '#4', x: 22, y: 1319, w: 458, h: 432, rotation: 0 }
		]
	},
	{
		id: 22,
		category: 'Music',
		name: 'Music 1',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 70, y: 134, w: 450, h: 385, rotation: 0 },
			{ name: '#2', x: 70, y: 529, w: 450, h: 385, rotation: 0 },
			{ name: '#3', x: 70, y: 922, w: 450, h: 384, rotation: 0 }
		]
	},
	{
		id: 23,
		category: 'Music',
		name: 'Music 2',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 72, y: 140, w: 448, h: 384, rotation: 0 },
			{ name: '#2', x: 72, y: 530, w: 448, h: 384, rotation: 0 },
			{ name: '#3', x: 72, y: 920, w: 448, h: 384, rotation: 0 }
		]
	},
	{
		id: 24,
		category: 'Music',
		name: 'Music 3',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 73, y: 149, w: 447, h: 384, rotation: 0 },
			{ name: '#2', x: 73, y: 539, w: 447, h: 383, rotation: 0 },
			{ name: '#3', x: 73, y: 929, w: 447, h: 383, rotation: 0 }
		]
	},
	{
		id: 25,
		category: 'Music',
		name: 'Music 4',
		photoCount: 3,
		slots: [
			{ name: '#1', x: 71, y: 149, w: 448, h: 383, rotation: 0 },
			{ name: '#2', x: 71, y: 539, w: 448, h: 383, rotation: 0 },
			{ name: '#3', x: 71, y: 928, w: 448, h: 384, rotation: 0 }
		]
	}
];

/** All unique frame categories in order. */
export const FRAME_CATEGORIES = ['Cartoon', 'Modern', 'Music', 'Newspaper'] as const;

/** Frame name → category color swatches (Indonesian labels from seed). */
export const FRAME_COLORS = [
	'Hitam',
	'Abu-abu',
	'Putih',
	'Beige',
	'Cokelat',
	'Olive',
	'Biru',
	'Langit Biru',
	'Hijau',
	'Teal',
	'Magenta',
	'Pink',
	'Cream',
	'Indigo',
	'Maroon'
];

/** Build a CustomTemplate from a FuncamFrame (used when user picks a frame). */
export function frameToTemplate(frame: FuncamFrame): import('#lib/types').CustomTemplate {
	const slots = frame.slots.map((s) => toNormalizedSlot(s));
	return {
		id: `funcam-${frame.id}`,
		name: frame.name,
		backgroundColor: '#000000',
		artworkLayer: 'overlay' as const,
		width: 600,
		height: 1800,
		slots,
		overlays: [],
		isCustom: false
	};
}
