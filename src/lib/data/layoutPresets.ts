/**
 * Layout Presets — starter slot geometry (0..1 ternormalisasi) untuk custom
 * templates. Dipilih di CustomTemplateBuilder; slot di-generate ulang dari
 * preset ini. Bentuk mandiri (rect/circle, boleh miring) — bebas dimodifikasi.
 */

export interface LayoutPresetSlot {
	/** 'rect' (default) atau 'circle' */
	type?: 'rect' | 'circle';
	x: number;
	y: number;
	width: number;
	height: number;
	/** Derajat, default 0 */
	rotation?: number;
	/** Radius sudut rect (px ruang acuan 600px), default 6 */
	borderRadius?: number;
}

export interface LayoutPreset {
	id: string;
	name: string;
	photoCount: number;
	slots: LayoutPresetSlot[];
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
	{
		id: 'big-shot',
		name: 'Big Shot',
		photoCount: 1,
		slots: [{ x: 0.05, y: 0.05, width: 0.9, height: 0.9, borderRadius: 8 }]
	},
	{
		id: 'two-stack',
		name: 'Two Stack',
		photoCount: 2,
		slots: [
			{ x: 0.05, y: 0.04, width: 0.9, height: 0.44, borderRadius: 8 },
			{ x: 0.05, y: 0.52, width: 0.9, height: 0.44, borderRadius: 8 }
		]
	},
	{
		id: 'three-stack',
		name: 'Three Stack',
		photoCount: 3,
		slots: [
			{ x: 0.05, y: 0.03, width: 0.9, height: 0.29, borderRadius: 8 },
			{ x: 0.05, y: 0.36, width: 0.9, height: 0.29, borderRadius: 8 },
			{ x: 0.05, y: 0.68, width: 0.9, height: 0.29, borderRadius: 8 }
		]
	},
	{
		id: 'four-grid',
		name: 'Four Grid',
		photoCount: 4,
		slots: [
			{ x: 0.05, y: 0.05, width: 0.425, height: 0.44, borderRadius: 8 },
			{ x: 0.53, y: 0.05, width: 0.425, height: 0.44, borderRadius: 8 },
			{ x: 0.05, y: 0.53, width: 0.425, height: 0.44, borderRadius: 8 },
			{ x: 0.53, y: 0.53, width: 0.425, height: 0.44, borderRadius: 8 }
		]
	},
	{
		id: 'big-left-2-small',
		name: 'Big Left + 2 Small',
		photoCount: 3,
		slots: [
			{ x: 0.04, y: 0.05, width: 0.52, height: 0.9, borderRadius: 8 },
			{ x: 0.6, y: 0.05, width: 0.36, height: 0.43, borderRadius: 8 },
			{ x: 0.6, y: 0.52, width: 0.36, height: 0.43, borderRadius: 8 }
		]
	},
	{
		id: 'big-right-2-small',
		name: 'Big Right + 2 Small',
		photoCount: 3,
		slots: [
			{ x: 0.44, y: 0.05, width: 0.52, height: 0.9, borderRadius: 8 },
			{ x: 0.04, y: 0.05, width: 0.36, height: 0.43, borderRadius: 8 },
			{ x: 0.04, y: 0.52, width: 0.36, height: 0.43, borderRadius: 8 }
		]
	},
	{
		id: 'big-top-2-small',
		name: 'Big Top + 2 Small',
		photoCount: 3,
		slots: [
			{ x: 0.05, y: 0.04, width: 0.9, height: 0.48, borderRadius: 8 },
			{ x: 0.05, y: 0.58, width: 0.43, height: 0.37, borderRadius: 8 },
			{ x: 0.52, y: 0.58, width: 0.43, height: 0.37, borderRadius: 8 }
		]
	},
	{
		id: 'five-grid',
		name: 'Five Grid',
		photoCount: 5,
		slots: [
			{ x: 0.05, y: 0.03, width: 0.425, height: 0.28, borderRadius: 8 },
			{ x: 0.53, y: 0.03, width: 0.425, height: 0.28, borderRadius: 8 },
			{ x: 0.05, y: 0.35, width: 0.425, height: 0.28, borderRadius: 8 },
			{ x: 0.53, y: 0.35, width: 0.425, height: 0.28, borderRadius: 8 },
			{ x: 0.05, y: 0.67, width: 0.9, height: 0.28, borderRadius: 8 }
		]
	},
	{
		id: 'six-grid',
		name: 'Six Grid',
		photoCount: 6,
		slots: [
			{ x: 0.05, y: 0.03, width: 0.425, height: 0.3, borderRadius: 8 },
			{ x: 0.53, y: 0.03, width: 0.425, height: 0.3, borderRadius: 8 },
			{ x: 0.05, y: 0.36, width: 0.425, height: 0.3, borderRadius: 8 },
			{ x: 0.53, y: 0.36, width: 0.425, height: 0.3, borderRadius: 8 },
			{ x: 0.05, y: 0.69, width: 0.425, height: 0.28, borderRadius: 8 },
			{ x: 0.53, y: 0.69, width: 0.425, height: 0.28, borderRadius: 8 }
		]
	},
	{
		id: 'tilted-collage',
		name: 'Tilted Collage',
		photoCount: 4,
		slots: [
			{ x: 0.09, y: 0.07, width: 0.4, height: 0.4, rotation: -4, borderRadius: 8 },
			{ x: 0.53, y: 0.1, width: 0.4, height: 0.4, rotation: 5, borderRadius: 8 },
			{ x: 0.08, y: 0.54, width: 0.4, height: 0.4, rotation: 6, borderRadius: 8 },
			{ x: 0.54, y: 0.51, width: 0.4, height: 0.4, rotation: -5, borderRadius: 8 }
		]
	},
	{
		id: 'tilted-trio',
		name: 'Tilted Trio',
		photoCount: 3,
		slots: [
			{ x: 0.07, y: 0.05, width: 0.82, height: 0.26, rotation: -3, borderRadius: 8 },
			{ x: 0.07, y: 0.37, width: 0.82, height: 0.26, rotation: 2, borderRadius: 8 },
			{ x: 0.07, y: 0.69, width: 0.82, height: 0.26, rotation: -2, borderRadius: 8 }
		]
	},
	{
		id: 'circle-trio',
		name: 'Circle Trio',
		photoCount: 3,
		slots: [
			{ type: 'circle', x: 0.12, y: 0.05, width: 0.76, height: 0.46, borderRadius: 0 },
			{ type: 'circle', x: 0.06, y: 0.58, width: 0.4, height: 0.34, borderRadius: 0 },
			{ type: 'circle', x: 0.54, y: 0.58, width: 0.4, height: 0.34, borderRadius: 0 }
		]
	}
];
