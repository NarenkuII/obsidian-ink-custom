import type { InkImage, InkStroke } from './types';

let copiedStrokes: InkStroke[] = [];
let pasteCounter = 0;
let copiedImages: InkImage[] = [];

export function copyInkStrokes(strokes: InkStroke[]): boolean {
	if (strokes.length === 0) return false;
	copiedStrokes = strokes.map(cloneStroke);
	copiedImages = [];
	return true;
}

export function createPastedInkStrokes(offset = 20): InkStroke[] {
	if (copiedStrokes.length === 0) return [];
	pasteCounter += 1;
	return copiedStrokes.map((stroke, index) => ({
		...cloneStroke(stroke),
		id: `s_paste_${Date.now()}_${pasteCounter}_${index}`,
		offset: {
			x: stroke.offset.x + offset * pasteCounter,
			y: stroke.offset.y + offset * pasteCounter,
		},
	}));
}

export function duplicateInkStrokes(strokes: InkStroke[], offset = 20): InkStroke[] {
	if (!copyInkStrokes(strokes)) return [];
	return createPastedInkStrokes(offset);
}

export function copyInkImages(images: InkImage[]): boolean {
	if (images.length === 0) return false;
	copiedImages = images.map(cloneImage);
	copiedStrokes = [];
	return true;
}

export function createPastedInkImages(offset = 20): InkImage[] {
	if (copiedImages.length === 0) return [];
	pasteCounter += 1;
	return copiedImages.map((image, index) => ({
		...cloneImage(image),
		id: `image_paste_${Date.now()}_${pasteCounter}_${index}`,
		x: image.x + offset * pasteCounter,
		y: image.y + offset * pasteCounter,
	}));
}

export function duplicateInkImages(images: InkImage[], offset = 20): InkImage[] {
	if (!copyInkImages(images)) return [];
	return createPastedInkImages(offset);
}

function cloneStroke(stroke: InkStroke): InkStroke {
	return {
		...stroke,
		points: stroke.points.map(([x, y, pressure]) => [x, y, pressure]),
		style: { ...stroke.style },
		offset: { ...stroke.offset },
	};
}

function cloneImage(image: InkImage): InkImage {
	return { ...image };
}
