/**
 * Strip Template Presets
 * Inspired by modern Korean/Indonesian photo-booth kiosk UI.
 * Provides rich visual themes (Vintage Bear, iMessage Chat, Fun Run, Ramadan, Bandung News, etc.)
 */

import type { CustomSlot, CustomTemplate } from '#lib/types';

export type TemplateCategory = 'all' | 'for-you' | 'new' | 'trending' | 'top-used';

export interface CatalogTemplate {
	id: string;
	name: string;
	category: ('for-you' | 'new' | 'trending' | 'top-used')[];
	badge?: string;
	bgColor: string;
	accentColor: string;
	slotCount?: number;
	previewSvg: string;
	buildTemplate: (photoCount: number) => CustomTemplate;
}

/** Generate normalized slot coordinates based on photo count (1 to 6).
 *  Dipakai preset adaptif dan builder untuk layout slot yang rapi;
 *  preset dengan artwork ber-frame tetap (mis. Vintage Journal)
 *  mengunci slotCount-nya agar foto tidak pernah meleset dari frame. */
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
			offsetY: 0,
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
				offsetY: 0,
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
				offsetY: 0,
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
				offsetY: 0,
			});
		}
		return slots;
	}

	if (count === 4) {
		const h = 0.20;
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
				offsetY: 0,
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
			offsetY: 0,
		});
	}
	return slots;
}

function svgDataUrl(svg: string): string {
	return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.trim());
}

export const CATALOG_TEMPLATES: CatalogTemplate[] = [
	// 1. VINTAGE JOURNAL / TEDDY (The exact hero one in screenshot!)
	{
		id: 'vintage-journal',
		name: 'Vintage Journal',
		category: ['for-you', 'trending'],
		badge: 'HOT',
		bgColor: '#E6DCC7',
		accentColor: '#9C7844',
		slotCount: 2,
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#E8DEC8"/>
			<!-- Cardboard frame 1 -->
			<rect x="12" y="14" width="76" height="100" fill="#D7C2A3" stroke="#8A6E4B" stroke-width="3"/>
			<rect x="18" y="20" width="64" height="88" fill="#C4AD8C"/>
			<text x="50" y="70" font-family="'Inter', sans-serif" font-size="28" font-weight="900" fill="#2C2318" text-anchor="middle">1</text>
			<!-- Cardboard character top right -->
			<rect x="70" y="8" width="18" height="24" rx="3" fill="#D49A6A"/>
			<circle cx="79" cy="18" r="4" fill="#3D2918"/>
			<!-- Middle decorations -->
			<text x="50" y="130" font-family="'Georgia', serif" font-size="6" font-style="italic" fill="#5C4730" text-anchor="middle">She is an old soul</text>
			<text x="50" y="138" font-family="'Georgia', serif" font-size="6" font-style="italic" fill="#5C4730" text-anchor="middle">with young eyes</text>
			<polygon points="50,143 53,148 47,148" fill="#8C5C38"/>
			<circle cx="30" cy="140" r="4" fill="#5C3B24"/>
			<!-- Cardboard frame 2 -->
			<rect x="12" y="152" width="76" height="100" fill="#D7C2A3" stroke="#8A6E4B" stroke-width="3"/>
			<rect x="18" y="158" width="64" height="88" fill="#C4AD8C"/>
			<text x="50" y="208" font-family="'Inter', sans-serif" font-size="28" font-weight="900" fill="#2C2318" text-anchor="middle">2</text>
			<!-- Character bottom left -->
			<polygon points="20,240 10,260 30,260" fill="#C79261"/>
			<circle cx="20" cy="245" r="5" fill="#3B2516"/>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<!-- Paper texture background -->
				<rect width="600" height="1800" fill="#E6DCC7"/>
				<!-- Quotes and cutouts in center -->
				<rect x="180" y="820" width="240" height="32" rx="4" fill="#D8CAAF" opacity="0.8"/>
				<text x="300" y="842" font-family="'Courier New', monospace" font-size="14" font-weight="bold" fill="#4A3B2A" text-anchor="middle">She's an old soul</text>
				<rect x="190" y="860" width="220" height="30" rx="4" fill="#D8CAAF" opacity="0.8"/>
				<text x="300" y="881" font-family="'Courier New', monospace" font-size="14" font-weight="bold" fill="#4A3B2A" text-anchor="middle">with young eyes,</text>
				<rect x="170" y="898" width="260" height="30" rx="4" fill="#D8CAAF" opacity="0.8"/>
				<text x="300" y="919" font-family="'Courier New', monospace" font-size="14" font-weight="bold" fill="#4A3B2A" text-anchor="middle">a vintage heart, and</text>
				<rect x="195" y="936" width="210" height="30" rx="4" fill="#D8CAAF" opacity="0.8"/>
				<text x="300" y="957" font-family="'Courier New', monospace" font-size="14" font-weight="bold" fill="#4A3B2A" text-anchor="middle">a beautiful mind.</text>
				<!-- Little coffee, croissant, stars -->
				<circle cx="210" cy="995" r="16" fill="#6B4F35"/>
				<ellipse cx="280" cy="995" rx="20" ry="12" fill="#C48E58"/>
				<polygon points="410,840 415,852 428,852 418,860 422,872 410,865 398,872 402,860 392,852 405,852" fill="#9C7844"/>
				<!-- 3D Cardboard box frames border overlay -->
				<rect x="68" y="104" width="464" height="692" fill="none" stroke="#9C774E" stroke-width="12" rx="8"/>
				<rect x="68" y="932" width="464" height="692" fill="none" stroke="#9C774E" stroke-width="12" rx="8"/>
				<!-- Top Right Character -->
				<rect x="470" y="65" width="85" height="110" rx="10" fill="#E0A976" stroke="#87582B" stroke-width="5"/>
				<circle cx="498" cy="110" r="7" fill="#24160A"/>
				<circle cx="530" cy="110" r="7" fill="#24160A"/>
				<ellipse cx="514" cy="130" rx="10" ry="6" fill="#D45A4F"/>
				<!-- Bottom Left Character -->
				<rect x="45" y="1520" width="105" height="135" rx="14" fill="#C99465" stroke="#7A4C24" stroke-width="6"/>
				<circle cx="80" cy="1575" r="8" fill="#24160A"/>
				<circle cx="115" cy="1575" r="8" fill="#24160A"/>
				<ellipse cx="98" cy="1600" rx="12" ry="7" fill="#D45A4F"/>
				<!-- Bottom watermark text -->
				<text x="300" y="1740" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#755E47" text-anchor="middle" letter-spacing="4">VINTAGE MEMORIES</text>
			</svg>`;
			return {
				id: 'vintage-journal',
				name: 'Vintage Journal',
				backgroundColor: '#E6DCC7',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 2. CHAT UI / IMESSAGE (Top-left in screenshot)
	{
		id: 'chat-ui',
		name: 'iMessage Chat',
		category: ['for-you', 'new'],
		badge: 'NEW',
		bgColor: '#FFFFFF',
		accentColor: '#007AFF',
		slotCount: 2,
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#FFFFFF"/>
			<!-- Chat top bar -->
			<rect width="100" height="30" fill="#F7F7F8" stroke="#E5E5EA" stroke-width="0.5"/>
			<circle cx="50" cy="12" r="6" fill="#8E8E93"/>
			<text x="50" y="25" font-family="'Inter', sans-serif" font-size="5" font-weight="600" fill="#000" text-anchor="middle">Sara Malik</text>
			<!-- Slot 1 (Chat attachment) -->
			<rect x="12" y="38" width="76" height="74" rx="8" fill="#E5E5EA"/>
			<text x="50" y="78" font-family="'Inter', sans-serif" font-size="22" font-weight="700" fill="#000" text-anchor="middle">1</text>
			<!-- Slot 2 (Chat attachment) -->
			<rect x="12" y="120" width="76" height="74" rx="8" fill="#E5E5EA"/>
			<text x="50" y="160" font-family="'Inter', sans-serif" font-size="22" font-weight="700" fill="#000" text-anchor="middle">2</text>
			<!-- Virtual keyboard at bottom -->
			<rect y="202" width="100" height="68" fill="#D1D3D9"/>
			<rect x="4" y="208" width="8" height="10" rx="2" fill="#FFF"/>
			<rect x="14" y="208" width="8" height="10" rx="2" fill="#FFF"/>
			<rect x="24" y="208" width="8" height="10" rx="2" fill="#FFF"/>
			<rect x="34" y="208" width="8" height="10" rx="2" fill="#FFF"/>
			<rect x="44" y="208" width="8" height="10" rx="2" fill="#FFF"/>
			<rect x="54" y="208" width="8" height="10" rx="2" fill="#FFF"/>
			<rect x="64" y="208" width="8" height="10" rx="2" fill="#FFF"/>
			<rect x="74" y="208" width="8" height="10" rx="2" fill="#FFF"/>
			<rect x="84" y="208" width="8" height="10" rx="2" fill="#FFF"/>
			<!-- Space bar -->
			<rect x="24" y="252" width="52" height="12" rx="3" fill="#FFF"/>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#FFFFFF"/>
				<!-- iOS Chat Top Bar -->
				<rect width="600" height="140" fill="#F6F6F6" stroke="#D1D1D6" stroke-width="2"/>
				<circle cx="300" cy="55" r="28" fill="#8E8E93"/>
				<text x="300" y="115" font-family="'-apple-system', sans-serif" font-size="20" font-weight="bold" fill="#000" text-anchor="middle">Sara Malik ›</text>
				<!-- Back button -->
				<path d="M40 70 L60 50 M40 70 L60 90" stroke="#007AFF" stroke-width="6" stroke-linecap="round" fill="none"/>
				<!-- Bottom Keyboard mockup -->
				<rect y="1420" width="600" height="380" fill="#D1D3D9"/>
				<rect x="150" y="1700" width="300" height="60" rx="8" fill="#FFFFFF"/>
				<text x="300" y="1738" font-family="'-apple-system', sans-serif" font-size="20" fill="#8E8E93" text-anchor="middle">space</text>
			</svg>`;
			return {
				id: 'chat-ui',
				name: 'iMessage Chat',
				backgroundColor: '#FFFFFF',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 3. FUN RUN (Top center in screenshot)
	{
		id: 'fun-run',
		name: 'Fun Run Festival',
		category: ['for-you', 'trending'],
		badge: 'NEW',
		bgColor: '#FFCC00',
		accentColor: '#FF3300',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#0044FF"/>
			<!-- Colorful curved energetic background -->
			<path d="M0,0 L100,0 L100,50 Q50,90 0,60 Z" fill="#FFCC00"/>
			<path d="M0,200 Q60,180 100,220 L100,270 L0,270 Z" fill="#FF1144"/>
			<!-- Badge -->
			<rect x="20" y="8" width="60" height="20" rx="4" fill="#001188"/>
			<text x="50" y="22" font-family="'Impact', sans-serif" font-size="10" fill="#FFFF00" text-anchor="middle">FUN RUN</text>
			<!-- Slot 1 -->
			<rect x="14" y="44" width="72" height="90" rx="8" fill="#FFCC00" stroke="#FFF" stroke-width="2"/>
			<text x="50" y="94" font-family="'Impact', sans-serif" font-size="30" fill="#000" text-anchor="middle">1</text>
			<!-- Slot 2 -->
			<rect x="14" y="146" width="72" height="90" rx="8" fill="#FFCC00" stroke="#FFF" stroke-width="2"/>
			<text x="50" y="196" font-family="'Impact', sans-serif" font-size="30" fill="#000" text-anchor="middle">2</text>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#0044FF"/>
				<!-- Bold dynamic waves -->
				<path d="M0 0 L600 0 L600 260 C400 320 200 180 0 240 Z" fill="#FFD000"/>
				<path d="M0 1520 C250 1440 450 1600 600 1500 L600 1800 L0 1800 Z" fill="#FF1A35"/>
				<!-- Runners silhouettes -->
				<path d="M30 180 Q60 140 80 190 T120 180" stroke="#000" stroke-width="8" fill="none"/>
				<path d="M480 1620 Q510 1580 540 1630 T580 1620" stroke="#FFF" stroke-width="8" fill="none"/>
				<!-- Header Fun Run badge -->
				<rect x="160" y="30" width="280" height="80" rx="14" fill="#0B1A80"/>
				<text x="300" y="85" font-family="'Arial Black', sans-serif" font-size="36" font-weight="900" fill="#FFD000" text-anchor="middle" font-style="italic">FUN RUN</text>
				<rect x="410" y="20" width="60" height="26" rx="6" fill="#FF1A35"/>
				<text x="440" y="38" font-family="'Arial Black', sans-serif" font-size="12" fill="#FFF" text-anchor="middle">NEW</text>
			</svg>`;
			return {
				id: 'fun-run',
				name: 'Fun Run Festival',
				backgroundColor: '#0044FF',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 4. WELCOME RAMADAN (Top right in screenshot)
	{
		id: 'welcome-ramadan',
		name: 'Welcome Ramadan',
		category: ['for-you', 'top-used'],
		badge: 'POPULAR',
		bgColor: '#B794DC',
		accentColor: '#8045B5',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#B596DA"/>
			<!-- Purple diamond pattern -->
			<polygon points="50,10 70,30 50,50 30,30" fill="#A480D0" opacity="0.6"/>
			<polygon points="50,90 70,110 50,130 30,110" fill="#A480D0" opacity="0.6"/>
			<polygon points="50,170 70,190 50,210 30,190" fill="#A480D0" opacity="0.6"/>
			<!-- Welcome Ramadan banner -->
			<rect x="10" y="8" width="80" height="18" rx="4" fill="#FFF" opacity="0.95"/>
			<text x="50" y="21" font-family="'Georgia', serif" font-size="7" font-weight="bold" fill="#7548A8" text-anchor="middle">Welcome Ramadan</text>
			<!-- Slot 1 polaroid -->
			<rect x="12" y="36" width="76" height="82" rx="4" fill="#FFF"/>
			<rect x="16" y="40" width="68" height="64" fill="#DDD"/>
			<text x="50" y="78" font-family="'Inter', sans-serif" font-size="20" font-weight="700" fill="#000" text-anchor="middle">1</text>
			<!-- Slot 2 polaroid -->
			<rect x="12" y="128" width="76" height="82" rx="4" fill="#FFF"/>
			<rect x="16" y="132" width="68" height="64" fill="#DDD"/>
			<text x="50" y="170" font-family="'Inter', sans-serif" font-size="20" font-weight="700" fill="#000" text-anchor="middle">2</text>
			<!-- Grass bottom -->
			<rect y="235" width="100" height="35" fill="#78B854"/>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#B596DA"/>
				<!-- Banner Header -->
				<rect x="60" y="30" width="480" height="80" rx="12" fill="#FFFFFF" opacity="0.95" filter="drop-shadow(0 4px 10px rgba(0,0,0,0.15))"/>
				<text x="300" y="80" font-family="'Georgia', serif" font-size="30" font-weight="bold" fill="#6B35A0" text-anchor="middle">★ Welcome Ramadan ★</text>
				<!-- Hanging lanterns -->
				<line x1="120" y1="0" x2="120" y2="40" stroke="#FFD700" stroke-width="4"/>
				<circle cx="120" cy="50" r="14" fill="#FFA500"/>
				<line x1="480" y1="0" x2="480" y2="40" stroke="#FFD700" stroke-width="4"/>
				<circle cx="480" cy="50" r="14" fill="#FFA500"/>
				<!-- Green bottom -->
				<path d="M0 1650 Q150 1620 300 1660 T600 1640 L600 1800 L0 1800 Z" fill="#6DAA47"/>
			</svg>`;
			return {
				id: 'welcome-ramadan',
				name: 'Welcome Ramadan',
				backgroundColor: '#B596DA',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 5. BANDUNG DAILY NEWS (Middle-left in screenshot)
	{
		id: 'bandung-news',
		name: 'Bandung Daily News',
		category: ['trending', 'top-used'],
		badge: 'TREND',
		bgColor: '#EEEEEE',
		accentColor: '#1A1A1A',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#EFEFEF"/>
			<!-- Masthead -->
			<text x="50" y="24" font-family="'Times New Roman', serif" font-size="14" font-weight="900" fill="#1A1A1A" text-anchor="middle" letter-spacing="1">BANDUNG</text>
			<line x1="8" y1="28" x2="92" y2="28" stroke="#1A1A1A" stroke-width="1.5"/>
			<line x1="8" y1="31" x2="92" y2="31" stroke="#1A1A1A" stroke-width="0.5"/>
			<!-- Slot 1 (News Photo) -->
			<rect x="12" y="38" width="76" height="88" fill="#DDD" stroke="#333" stroke-width="1"/>
			<text x="50" y="88" font-family="'Times New Roman', serif" font-size="28" font-weight="700" fill="#000" text-anchor="middle">1</text>
			<!-- Newspaper text column mockup -->
			<line x1="12" y1="134" x2="88" y2="134" stroke="#888" stroke-width="2"/>
			<line x1="12" y1="140" x2="88" y2="140" stroke="#AAA" stroke-width="1.5"/>
			<line x1="12" y1="146" x2="88" y2="146" stroke="#AAA" stroke-width="1.5"/>
			<line x1="12" y1="152" x2="60" y2="152" stroke="#AAA" stroke-width="1.5"/>
			<!-- Slot 2 (News Photo) -->
			<rect x="12" y="160" width="76" height="88" fill="#DDD" stroke="#333" stroke-width="1"/>
			<text x="50" y="210" font-family="'Times New Roman', serif" font-size="28" font-weight="700" fill="#000" text-anchor="middle">2</text>
			<line x1="12" y1="256" x2="88" y2="256" stroke="#AAA" stroke-width="1.5"/>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#EFEFEF"/>
				<text x="300" y="65" font-family="'Times New Roman', serif" font-size="16" letter-spacing="6" fill="#444" text-anchor="middle">DAILY PHOTO EDITION</text>
				<text x="300" y="140" font-family="'Times New Roman', serif" font-size="62" font-weight="900" fill="#111" text-anchor="middle" letter-spacing="4">BANDUNG</text>
				<line x1="40" y1="160" x2="560" y2="160" stroke="#111" stroke-width="4"/>
				<line x1="40" y1="168" x2="560" y2="168" stroke="#111" stroke-width="1.5"/>
				<text x="60" y="185" font-family="'Courier New', monospace" font-size="12" fill="#555">VOL. XXIV ... NO. 81</text>
				<text x="540" y="185" font-family="'Courier New', monospace" font-size="12" fill="#555" text-anchor="end">PRICE: PRICELESS</text>
			</svg>`;
			return {
				id: 'bandung-news',
				name: 'Bandung Daily News',
				backgroundColor: '#EFEFEF',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 6. ELECTRIC ROYAL BLUE (Center in screenshot)
	{
		id: 'royal-blue',
		name: 'Vibrant Royal Blue',
		category: ['for-you', 'top-used'],
		badge: 'CLASSIC',
		bgColor: '#0044FF',
		accentColor: '#FFFFFF',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#0044FF"/>
			<!-- Slot 1 -->
			<rect x="12" y="24" width="76" height="96" rx="6" fill="#0035CC" stroke="#FFFFFF" stroke-width="2"/>
			<text x="50" y="78" font-family="'Inter', sans-serif" font-size="32" font-weight="900" fill="#FFFFFF" text-anchor="middle">1</text>
			<!-- Slot 2 -->
			<rect x="12" y="136" width="76" height="96" rx="6" fill="#0035CC" stroke="#FFFFFF" stroke-width="2"/>
			<text x="50" y="190" font-family="'Inter', sans-serif" font-size="32" font-weight="900" fill="#FFFFFF" text-anchor="middle">2</text>
			<text x="50" y="254" font-family="'Courier New', monospace" font-size="6" font-weight="bold" fill="#FFFFFF" opacity="0.8" text-anchor="middle" letter-spacing="2">SNAPPY BOOTH</text>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#0044FF"/>
				<text x="300" y="1740" font-family="'Courier New', monospace" font-size="18" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="6">DISTUDIO PHOTOBOOTH</text>
			</svg>`;
			return {
				id: 'royal-blue',
				name: 'Vibrant Royal Blue',
				backgroundColor: '#0044FF',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 7. WINTER WONDERLAND (Middle-right in screenshot)
	{
		id: 'winter-snow',
		name: 'Winter Wonderland',
		category: ['new'],
		badge: 'NEW',
		bgColor: '#375775',
		accentColor: '#E6F4FF',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#375775"/>
			<!-- Snowflakes -->
			<circle cx="20" cy="15" r="1.5" fill="#FFF" opacity="0.8"/>
			<circle cx="80" cy="30" r="2" fill="#FFF" opacity="0.8"/>
			<circle cx="15" cy="130" r="1.5" fill="#FFF" opacity="0.8"/>
			<circle cx="85" cy="180" r="2" fill="#FFF" opacity="0.8"/>
			<!-- Slot 1 -->
			<rect x="14" y="24" width="72" height="92" rx="4" fill="#253E56" stroke="#C8E2F8" stroke-width="2"/>
			<text x="50" y="76" font-family="'Inter', sans-serif" font-size="28" font-weight="900" fill="#FFF" text-anchor="middle">1</text>
			<!-- Slot 2 -->
			<rect x="14" y="132" width="72" height="92" rx="4" fill="#253E56" stroke="#C8E2F8" stroke-width="2"/>
			<text x="50" y="184" font-family="'Inter', sans-serif" font-size="28" font-weight="900" fill="#FFF" text-anchor="middle">2</text>
			<!-- Cute penguin / bear at bottom -->
			<circle cx="50" cy="245" r="12" fill="#FFF"/>
			<circle cx="46" cy="244" r="1.5" fill="#000"/>
			<circle cx="54" cy="244" r="1.5" fill="#000"/>
			<polygon points="50,246 48,249 52,249" fill="#FFA500"/>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#375775"/>
				<circle cx="100" cy="90" r="8" fill="#FFF" opacity="0.8"/>
				<circle cx="500" cy="180" r="12" fill="#FFF" opacity="0.8"/>
				<circle cx="80" cy="900" r="10" fill="#FFF" opacity="0.8"/>
				<circle cx="520" cy="1200" r="14" fill="#FFF" opacity="0.8"/>
				<!-- Snow hills bottom -->
				<path d="M0 1680 Q180 1620 360 1690 T600 1660 L600 1800 L0 1800 Z" fill="#E6F2FC"/>
			</svg>`;
			return {
				id: 'winter-snow',
				name: 'Winter Wonderland',
				backgroundColor: '#375775',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 8. MINIMALIST CRISP WHITE (Bottom-left in screenshot)
	{
		id: 'minimal-white',
		name: 'Minimal Clean White',
		category: ['for-you', 'top-used'],
		badge: 'CLEAN',
		bgColor: '#FFFFFF',
		accentColor: '#111111',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#FFFFFF"/>
			<rect x="12" y="24" width="76" height="96" rx="4" fill="#F4F4F5" stroke="#E4E4E7" stroke-width="1"/>
			<text x="50" y="78" font-family="'Inter', sans-serif" font-size="28" font-weight="800" fill="#18181B" text-anchor="middle">1</text>
			<rect x="12" y="136" width="76" height="96" rx="4" fill="#F4F4F5" stroke="#E4E4E7" stroke-width="1"/>
			<text x="50" y="190" font-family="'Inter', sans-serif" font-size="28" font-weight="800" fill="#18181B" text-anchor="middle">2</text>
			<text x="50" y="254" font-family="'Inter', sans-serif" font-size="6" font-weight="700" fill="#71717A" text-anchor="middle" letter-spacing="3">STUDIO MINIMAL</text>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#FFFFFF"/>
				<text x="300" y="1740" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#27272A" text-anchor="middle" letter-spacing="6">DISTUDIO • MINIMAL</text>
			</svg>`;
			return {
				id: 'minimal-white',
				name: 'Minimal Clean White',
				backgroundColor: '#FFFFFF',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 9. RAMADAN KAREEM PASTEL (Bottom-center in screenshot)
	{
		id: 'ramadan-kareem',
		name: 'Ramadan Kareem',
		category: ['top-used'],
		badge: 'POPULAR',
		bgColor: '#FFF7EB',
		accentColor: '#D97706',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#FFF7EB"/>
			<!-- Moon and Title -->
			<circle cx="25" cy="20" r="8" fill="#FCD34D"/>
			<circle cx="28" cy="18" r="7" fill="#FFF7EB"/>
			<text x="58" y="24" font-family="'Georgia', serif" font-size="7" font-weight="bold" fill="#92400E">Ramadan Kareem</text>
			<!-- Slot 1 -->
			<rect x="12" y="38" width="76" height="88" rx="6" fill="#FEF3C7" stroke="#FDE68A" stroke-width="2"/>
			<text x="50" y="88" font-family="'Georgia', serif" font-size="28" font-weight="700" fill="#92400E" text-anchor="middle">1</text>
			<!-- Slot 2 -->
			<rect x="12" y="140" width="76" height="88" rx="6" fill="#FEF3C7" stroke="#FDE68A" stroke-width="2"/>
			<text x="50" y="190" font-family="'Georgia', serif" font-size="28" font-weight="700" fill="#92400E" text-anchor="middle">2</text>
			<!-- Lantern bottom -->
			<circle cx="50" cy="248" r="8" fill="#FBBF24"/>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#FFF7EB"/>
				<!-- Crescent Moon top left -->
				<circle cx="100" cy="80" r="35" fill="#F59E0B"/>
				<circle cx="115" cy="72" r="30" fill="#FFF7EB"/>
				<text x="320" y="95" font-family="'Georgia', serif" font-size="34" font-weight="bold" fill="#92400E">Ramadan Kareem</text>
				<line x1="80" y1="125" x2="520" y2="125" stroke="#FDE68A" stroke-width="3"/>
			</svg>`;
			return {
				id: 'ramadan-kareem',
				name: 'Ramadan Kareem',
				backgroundColor: '#FFF7EB',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 10. LOVE LETTERS / CUTOUT (Bottom-right in screenshot)
	{
		id: 'love-letters',
		name: 'Love Letters Cutout',
		category: ['new', 'trending'],
		badge: 'HOT',
		bgColor: '#FAF6F0',
		accentColor: '#DC2626',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#FAF6F0"/>
			<!-- Slot 1 -->
			<rect x="12" y="24" width="76" height="96" rx="4" fill="#F5EFE6" stroke="#E6DAC8" stroke-width="1.5"/>
			<text x="50" y="78" font-family="'Georgia', serif" font-size="28" font-weight="700" fill="#2C2621" text-anchor="middle">1</text>
			<!-- Slot 2 -->
			<rect x="12" y="132" width="76" height="96" rx="4" fill="#F5EFE6" stroke="#E6DAC8" stroke-width="1.5"/>
			<text x="50" y="186" font-family="'Georgia', serif" font-size="28" font-weight="700" fill="#2C2621" text-anchor="middle">2</text>
			<!-- Cutout Magazine Letters LOVE -->
			<g transform="translate(14, 238)">
				<rect x="0" y="0" width="16" height="20" fill="#DC2626" rx="2"/>
				<text x="8" y="14" font-family="'Arial Black', sans-serif" font-size="11" fill="#FFF" text-anchor="middle">♥</text>
				<rect x="18" y="0" width="16" height="20" fill="#18181B" rx="2"/>
				<text x="26" y="15" font-family="'Arial Black', sans-serif" font-size="12" fill="#FFF" text-anchor="middle">L</text>
				<rect x="36" y="0" width="16" height="20" fill="#F59E0B" rx="2"/>
				<text x="44" y="15" font-family="'Arial Black', sans-serif" font-size="12" fill="#000" text-anchor="middle">O</text>
				<rect x="54" y="0" width="16" height="20" fill="#2563EB" rx="2"/>
				<text x="62" y="15" font-family="'Arial Black', sans-serif" font-size="12" fill="#FFF" text-anchor="middle">V</text>
				<rect x="72" y="0" width="16" height="20" fill="#059669" rx="2"/>
				<text x="80" y="15" font-family="'Arial Black', sans-serif" font-size="12" fill="#FFF" text-anchor="middle">E</text>
			</g>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#FAF6F0"/>
				<!-- Cutout letters LOVE at bottom -->
				<g transform="translate(110, 1660)">
					<rect x="0" y="0" width="65" height="85" rx="6" fill="#DC2626"/>
					<text x="32" y="60" font-family="'Arial Black', sans-serif" font-size="44" fill="#FFFFFF" text-anchor="middle">♥</text>
					<rect x="75" y="0" width="65" height="85" rx="6" fill="#18181B"/>
					<text x="107" y="60" font-family="'Arial Black', sans-serif" font-size="48" fill="#FFFFFF" text-anchor="middle">L</text>
					<rect x="150" y="0" width="65" height="85" rx="6" fill="#F59E0B"/>
					<text x="182" y="60" font-family="'Arial Black', sans-serif" font-size="48" fill="#000000" text-anchor="middle">O</text>
					<rect x="225" y="0" width="65" height="85" rx="6" fill="#2563EB"/>
					<text x="257" y="60" font-family="'Arial Black', sans-serif" font-size="48" fill="#FFFFFF" text-anchor="middle">V</text>
					<rect x="300" y="0" width="65" height="85" rx="6" fill="#059669"/>
					<text x="332" y="60" font-family="'Arial Black', sans-serif" font-size="48" fill="#FFFFFF" text-anchor="middle">E</text>
				</g>
			</svg>`;
			return {
				id: 'love-letters',
				name: 'Love Letters Cutout',
				backgroundColor: '#FAF6F0',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 11. CLASSIC NOIR (Dark Room)
	{
		id: 'darkroom',
		name: 'Dark Room',
		category: ['for-you', 'top-used'],
		bgColor: '#191715',
		accentColor: '#C2503E',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#191715"/>
			<rect x="12" y="24" width="76" height="96" rx="4" fill="#26221F" stroke="#6B5F53" stroke-width="1"/>
			<text x="50" y="78" font-family="'Inter', sans-serif" font-size="28" font-weight="800" fill="#EFE9DD" text-anchor="middle">1</text>
			<rect x="12" y="136" width="76" height="96" rx="4" fill="#26221F" stroke="#6B5F53" stroke-width="1"/>
			<text x="50" y="190" font-family="'Inter', sans-serif" font-size="28" font-weight="800" fill="#EFE9DD" text-anchor="middle">2</text>
			<text x="50" y="254" font-family="'Georgia', serif" font-size="6" font-style="italic" fill="#C2503E" text-anchor="middle">DARKROOM</text>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#191715"/>
				<text x="300" y="1740" font-family="'Georgia', serif" font-size="18" font-style="italic" fill="#C2503E" text-anchor="middle" letter-spacing="4">DARKROOM • PHOTO STUDIO</text>
			</svg>`;
			return {
				id: 'darkroom',
				name: 'Dark Room',
				backgroundColor: '#191715',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},

	// 12. PASTEL LAVENDER
	{
		id: 'lavender',
		name: 'Soft Lavender',
		category: ['new', 'top-used'],
		bgColor: '#F5F2FA',
		accentColor: '#8E77B8',
		previewSvg: `<svg viewBox="0 0 100 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="270" fill="#F5F2FA"/>
			<rect x="12" y="24" width="76" height="96" rx="4" fill="#EBE5F4" stroke="#B9A7D6" stroke-width="1"/>
			<text x="50" y="78" font-family="'Inter', sans-serif" font-size="28" font-weight="800" fill="#443161" text-anchor="middle">1</text>
			<rect x="12" y="136" width="76" height="96" rx="4" fill="#EBE5F4" stroke="#B9A7D6" stroke-width="1"/>
			<text x="50" y="190" font-family="'Inter', sans-serif" font-size="28" font-weight="800" fill="#443161" text-anchor="middle">2</text>
			<text x="50" y="254" font-family="'Inter', sans-serif" font-size="6" font-weight="600" fill="#8E77B8" text-anchor="middle" letter-spacing="3">LAVENDER MIST</text>
		</svg>`,
		buildTemplate: (photoCount) => {
			const svg = `<svg viewBox="0 0 600 1800" width="600" height="1800" xmlns="http://www.w3.org/2000/svg">
				<rect width="600" height="1800" fill="#F5F2FA"/>
				<text x="300" y="1740" font-family="'Inter', sans-serif" font-size="16" font-weight="600" fill="#8E77B8" text-anchor="middle" letter-spacing="6">LAVENDER MIST • PHOTOBOOTH</text>
			</svg>`;
			return {
				id: 'lavender',
				name: 'Soft Lavender',
				backgroundColor: '#F5F2FA',
				artworkDataUrl: svgDataUrl(svg),
				artworkLayer: 'overlay',
				slots: generateSlots(photoCount),
				isCustom: true,
			};
		},
	},
];
