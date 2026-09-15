import {
	DEFAULT_CONTENT_COLOUR_PRIMARY_STROKE,
	DEFAULT_CONTENT_COLOUR_WRITING_LINE,
	INK_SVG_STROKE_PATH_CLASS,
	INK_SVG_WRITING_LINE_CLASS,
} from 'src/default-content-colours';
import { INK_CANVAS_FORMAT_VERSION, WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT } from 'src/constants';
import type { InkImage, InkStroke, InkCanvasSnapshot } from './types';
import { getRenderedStrokeData } from './rendered-stroke-cache';
///////////////////////////
///////////////////////////

/**
 * Render an array of strokes into a self-contained SVG string suitable for
 * saving as a `.svg` file. The viewBox is computed to tightly fit all strokes
 * with optional padding.
 */
export function renderStrokesToSvg(
	strokes: InkStroke[],
	snapshotJson: InkCanvasSnapshot,
	padding: number = 16,
): string {
	const images = snapshotJson.images ?? [];
	if (strokes.length === 0 && images.length === 0) {
		return buildSvgString('', '0 0 1 1', snapshotJson);
	}

	const rendered = renderStrokePathsAndBounds(strokes);
	const bounds = combinedContentBounds(rendered.bounds, strokes.length > 0, images);
	const viewBox = [
		bounds.minX - padding,
		bounds.minY - padding,
		bounds.width + padding * 2,
		bounds.height + padding * 2,
	].join(' ');

	return buildSvgString(renderImageMarkup(images) + rendered.pathsMarkup, viewBox, snapshotJson);
}

/**
 * Render writing strokes into a fixed-width SVG with horizontal guide lines.
 * Used for inkWriting file storage and embed preview.
 */
export function renderWritingStrokesToSvg(
	strokes: InkStroke[],
	snapshot: InkCanvasSnapshot,
	pageWidth: number,
	padding: number = 0,
): string {
	const lineHeight = snapshot.writingLineHeight ?? WRITING_LINE_HEIGHT;
	const rendered = renderStrokePathsAndBounds(strokes);
	const images = snapshot.images ?? [];
	let height = WRITING_MIN_PAGE_HEIGHT;
	if (strokes.length > 0 || images.length > 0) {
		const contentMaxY = Math.max(
			strokes.length > 0 ? rendered.bounds.maxY : 0,
			...images.map((image) => image.y + image.height),
		);
		const numFilledLines = Math.ceil((contentMaxY + padding) / lineHeight);
		height = Math.max((numFilledLines + 0.5) * lineHeight, WRITING_MIN_PAGE_HEIGHT);
	}

	const margin = pageWidth * 0.05;
	let guideMarkup = '';
	const lineCount = Math.floor(height / lineHeight);
	for (let i = 1; i <= lineCount; i++) {
		const y = i * lineHeight;
		guideMarkup += `<line x1="${margin}" y1="${y}" x2="${pageWidth - margin}" y2="${y}" stroke="${DEFAULT_CONTENT_COLOUR_WRITING_LINE}" stroke-opacity="0.5" class="${INK_SVG_WRITING_LINE_CLASS}" />\n`;
	}

	const viewBox = `0 0 ${pageWidth} ${height}`;
	return buildSvgString(guideMarkup + renderImageMarkup(images) + rendered.pathsMarkup, viewBox, snapshot);
}


function resolveStrokeExportColour(colour: string): string {
	if (colour === 'currentColor') return DEFAULT_CONTENT_COLOUR_PRIMARY_STROKE;
	if (/^#[0-9a-f]{6}$/i.test(colour)) return colour;
	return DEFAULT_CONTENT_COLOUR_PRIMARY_STROKE;
}

function buildStrokePathMarkup(d: string, offsetX: number, offsetY: number, colour: string): string {
	const pathClass = colour === 'currentColor'
		? INK_SVG_STROKE_PATH_CLASS
		: 'ink-type-stroke ink-color-custom';
	const pathAttrs = `d="${d}" fill="${resolveStrokeExportColour(colour)}" class="${pathClass}"`;
	const hasOffset = offsetX !== 0 || offsetY !== 0;
	if (hasOffset) {
		return `<g transform="translate(${offsetX},${offsetY})"><path ${pathAttrs} /></g>\n`;
	}
	return `<path ${pathAttrs} />\n`;
}

function renderImageMarkup(images: InkImage[]): string {
	return images.map((image) => {
		const transform = `translate(${image.x} ${image.y}) rotate(${image.rotation} ${image.width / 2} ${image.height / 2})`;
		return `<g transform="${transform}" class="ink-type-image"><image href="${escapeXmlAttribute(image.dataUrl)}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none" /></g>\n`;
	}).join('');
}

function combinedContentBounds(strokeBounds: StrokeBounds, hasStrokes: boolean, images: InkImage[]): StrokeBounds {
	let minX = hasStrokes ? strokeBounds.minX : Infinity;
	let minY = hasStrokes ? strokeBounds.minY : Infinity;
	let maxX = hasStrokes ? strokeBounds.maxX : -Infinity;
	let maxY = hasStrokes ? strokeBounds.maxY : -Infinity;
	for (const image of images) {
		minX = Math.min(minX, image.x);
		minY = Math.min(minY, image.y);
		maxX = Math.max(maxX, image.x + image.width);
		maxY = Math.max(maxY, image.y + image.height);
	}
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function escapeXmlAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Building the full SVG document
///////////////////////////

function buildSvgString(
	pathsMarkup: string,
	viewBox: string,
	snapshotJson: InkCanvasSnapshot,
): string {
	const metadataJson = JSON.stringify(snapshotJson);

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
		`<metadata>`,
		`<ink-canvas version="${INK_CANVAS_FORMAT_VERSION}">${escapeXmlText(metadataJson)}</ink-canvas>`,
		`</metadata>`,
		pathsMarkup,
		`</svg>`,
	].join('\n');
}

function escapeXmlText(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function renderStrokePathsAndBounds(strokes: InkStroke[]): {
	pathsMarkup: string;
	bounds: StrokeBounds;
} {
	if (strokes.length === 0) {
		return {
			pathsMarkup: '',
			bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
		};
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let pathsMarkup = '';

	for (const stroke of strokes) {
		const rendered = getRenderedStrokeData(stroke);
		const strokeMinX = rendered.bounds.minX + stroke.offset.x;
		const strokeMinY = rendered.bounds.minY + stroke.offset.y;
		const strokeMaxX = rendered.bounds.maxX + stroke.offset.x;
		const strokeMaxY = rendered.bounds.maxY + stroke.offset.y;
		if (strokeMinX < minX) minX = strokeMinX;
		if (strokeMinY < minY) minY = strokeMinY;
		if (strokeMaxX > maxX) maxX = strokeMaxX;
		if (strokeMaxY > maxY) maxY = strokeMaxY;
		pathsMarkup += buildStrokePathMarkup(
			rendered.pathD,
			stroke.offset.x,
			stroke.offset.y,
			stroke.style.color,
		);
	}

	return {
		pathsMarkup,
		bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
	};
}


// Bounds calculation
///////////////////////////

export interface StrokeBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

export function computeStrokesBounds(strokes: InkStroke[]): StrokeBounds {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const stroke of strokes) {
		const rendered = getRenderedStrokeData(stroke);
		const strokeMinX = rendered.bounds.minX + stroke.offset.x;
		const strokeMinY = rendered.bounds.minY + stroke.offset.y;
		const strokeMaxX = rendered.bounds.maxX + stroke.offset.x;
		const strokeMaxY = rendered.bounds.maxY + stroke.offset.y;
		if (strokeMinX < minX) minX = strokeMinX;
		if (strokeMinY < minY) minY = strokeMinY;
		if (strokeMaxX > maxX) maxX = strokeMaxX;
		if (strokeMaxY > maxY) maxY = strokeMaxY;
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY,
	};
}
