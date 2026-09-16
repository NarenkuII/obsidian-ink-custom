import { RemoveStrokesCommand, ReplaceStrokesCommand } from '../commands';
import {
	ERASER_COMMIT_PREVIEW_MS,
	INK_PRECISE_ERASE_PREVIEW_CLASS,
	INK_STROKE_PENDING_ERASE_CLASS,
} from '../constants/erase-tool';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import type { CameraState } from '../types';
import type { ClientPoint } from '../utils/eraser-hit-samples';
import { getEraserClientSamplePoints } from '../utils/eraser-hit-samples';
import { getStrokeIdsAtClientPoint } from '../utils/stroke-hit-test';
import { screenToPage } from '../camera';
import { splitStrokeByEraserPath, type EraserPoint } from '../precise-eraser';
import { eraserHitRadiusScreenPx } from '../stroke-zoom-scale';

///////////////////////////
///////////////////////////

export interface EraseToolContext {
	store: StrokeStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getSvgElement: () => SVGSVGElement | null;
	getWholeStrokeEraser: () => boolean;
	onErase?: () => void;
}

let erasing = false;
let touchedStrokeIds: Set<string> = new Set();
let lastEraseClientPoint: ClientPoint | null = null;
const pendingRemovalStrokeIds = new Set<string>();
let preciseEraserPath: EraserPoint[] = [];

export function eraseToolPointerDown(e: PointerEvent, ctx: EraseToolContext): void {
	erasing = true;
	touchedStrokeIds = new Set();
	lastEraseClientPoint = null;
	preciseEraserPath = [];
	appendPreciseEraserPoint(e.clientX, e.clientY, ctx);
	hitTestEraserAtClientPoint(e.clientX, e.clientY, null, ctx);
	lastEraseClientPoint = { x: e.clientX, y: e.clientY };
}

export function eraseToolPointerMove(e: PointerEvent, ctx: EraseToolContext): void {
	if (!erasing) return;
	appendPreciseEraserPoint(e.clientX, e.clientY, ctx);
	hitTestEraserAtClientPoint(e.clientX, e.clientY, lastEraseClientPoint, ctx);
	lastEraseClientPoint = { x: e.clientX, y: e.clientY };
}

export function eraseToolPointerUp(_e: PointerEvent, ctx: EraseToolContext): void {
	if (!erasing) return;
	erasing = false;
	lastEraseClientPoint = null;

	const ids = Array.from(touchedStrokeIds);
	touchedStrokeIds = new Set();

	if (ids.length > 0 && ctx.getWholeStrokeEraser()) {
		ids.forEach((id) => pendingRemovalStrokeIds.add(id));
		window.setTimeout(() => {
			const command = new RemoveStrokesCommand(ctx.store, ids);
			ctx.undoManager.execute(command);
			ids.forEach((id) => pendingRemovalStrokeIds.delete(id));
			ctx.onErase?.();
		}, ERASER_COMMIT_PREVIEW_MS);
	} else if (ids.length > 0) {
		const svg = ctx.getSvgElement();
		if (svg) {
			clearPendingErasePreview(svg, ids);
			clearPreciseErasePreview(svg);
		}
		const originals = ids
			.map((id) => ctx.store.getById(id))
			.filter((stroke): stroke is NonNullable<typeof stroke> => stroke !== undefined);
		const radius = eraserHitRadiusScreenPx(ctx.getCamera().zoom) / ctx.getCamera().zoom;
		const replacements = originals.flatMap((stroke) =>
			splitStrokeByEraserPath(stroke, preciseEraserPath, radius),
		);
		ctx.undoManager.execute(new ReplaceStrokesCommand(ctx.store, originals, replacements));
		ctx.onErase?.();
	}
	const svg = ctx.getSvgElement();
	if (svg) clearPreciseErasePreview(svg);
	preciseEraserPath = [];
}

export function eraseToolPointerCancel(_e: PointerEvent, ctx: EraseToolContext): void {
	const svg = ctx.getSvgElement();
	if (svg && touchedStrokeIds.size > 0) {
		clearPendingErasePreview(svg, touchedStrokeIds);
	}
	if (svg) clearPreciseErasePreview(svg);
	erasing = false;
	lastEraseClientPoint = null;
	touchedStrokeIds = new Set();
	preciseEraserPath = [];
}

export function isEraseToolActive(): boolean {
	return erasing;
}


// Helpers
///////////////////////////

/**
 * Hit-test strokes under the eraser footprint (radius + sweep along the drag path).
 * Uses the rendered SVG hit target directly so it respects transforms and works
 * in runtimes where SVGGeometryElement.isPointInFill() is unavailable.
 */
function hitTestEraserAtClientPoint(
	clientX: number,
	clientY: number,
	lastClientPoint: ClientPoint | null,
	ctx: EraseToolContext,
): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;

	const cameraZoom = ctx.getCamera().zoom;
	const samplePoints = getEraserClientSamplePoints(
		clientX,
		clientY,
		lastClientPoint,
		cameraZoom,
	);
	for (const sample of samplePoints) {
		for (const strokeId of getStrokeIdsAtClientPoint(svg, sample.x, sample.y)) {
			if (pendingRemovalStrokeIds.has(strokeId)) continue;
			markStrokeForErase(svg, strokeId, ctx.getWholeStrokeEraser());
		}
	}
	if (!ctx.getWholeStrokeEraser()) updatePreciseErasePreview(svg, ctx);
}

function appendPreciseEraserPoint(clientX: number, clientY: number, ctx: EraseToolContext): void {
	if (ctx.getWholeStrokeEraser()) return;
	const point = screenToPage(ctx.getCamera(), ctx.getContainerRect(), clientX, clientY);
	const previous = preciseEraserPath[preciseEraserPath.length - 1];
	if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5 / ctx.getCamera().zoom) {
		preciseEraserPath.push(point);
	}
}

function getStrokeGroupElement(svg: SVGSVGElement, strokeId: string): SVGGElement | null {
	return svg.querySelector<SVGGElement>(
		`[data-stroke-group][data-stroke-id="${CSS.escape(strokeId)}"]`,
	);
}

function markStrokeForErase(svg: SVGSVGElement, strokeId: string, wholeStroke: boolean): void {
	if (touchedStrokeIds.has(strokeId)) return;

	const strokeGroup = getStrokeGroupElement(svg, strokeId);
	if (!strokeGroup) return;

	touchedStrokeIds.add(strokeId);
	if (wholeStroke) strokeGroup.classList.add(INK_STROKE_PENDING_ERASE_CLASS);
}

function clearPendingErasePreview(svg: SVGSVGElement, strokeIds: Iterable<string>): void {
	for (const strokeId of strokeIds) {
		const strokeGroup = getStrokeGroupElement(svg, strokeId);
		strokeGroup?.classList.remove(INK_STROKE_PENDING_ERASE_CLASS);
	}
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function updatePreciseErasePreview(svg: SVGSVGElement, ctx: EraseToolContext): void {
	clearPreciseErasePreview(svg);
	if (touchedStrokeIds.size === 0 || preciseEraserPath.length === 0) return;

	const strokeGroups = Array.from(touchedStrokeIds)
		.map((id) => getStrokeGroupElement(svg, id))
		.filter((group): group is SVGGElement => group !== null);
	const parent = strokeGroups[0]?.parentElement;
	if (!parent) return;

	const preview = document.createElementNS(SVG_NS, 'g');
	preview.classList.add(INK_PRECISE_ERASE_PREVIEW_CLASS);
	preview.setAttribute('pointer-events', 'none');

	const clipId = `ink-precise-erase-${Date.now()}`;
	const defs = document.createElementNS(SVG_NS, 'defs');
	const clipPath = document.createElementNS(SVG_NS, 'clipPath');
	clipPath.setAttribute('id', clipId);
	clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
	const radius = eraserHitRadiusScreenPx(ctx.getCamera().zoom) / ctx.getCamera().zoom;
	for (const point of preciseEraserPath) {
		const circle = document.createElementNS(SVG_NS, 'circle');
		circle.setAttribute('cx', String(point.x));
		circle.setAttribute('cy', String(point.y));
		circle.setAttribute('r', String(radius));
		clipPath.appendChild(circle);
	}
	defs.appendChild(clipPath);
	preview.appendChild(defs);

	const clippedStrokes = document.createElementNS(SVG_NS, 'g');
	clippedStrokes.setAttribute('clip-path', `url(#${clipId})`);
	for (const group of strokeGroups) clippedStrokes.appendChild(group.cloneNode(true));
	preview.appendChild(clippedStrokes);
	parent.appendChild(preview);
}

function clearPreciseErasePreview(svg: SVGSVGElement): void {
	svg.querySelectorAll(`.${INK_PRECISE_ERASE_PREVIEW_CLASS}`).forEach((element) => element.remove());
}
