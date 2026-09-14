import { RemoveStrokesCommand } from '../commands';
import { INK_STROKE_PENDING_ERASE_CLASS } from '../constants/erase-tool';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import type { CameraState } from '../types';
import type { ClientPoint } from '../utils/eraser-hit-samples';
import { getEraserClientSamplePoints } from '../utils/eraser-hit-samples';
import { getStrokeIdAtClientPoint } from '../utils/stroke-hit-test';

///////////////////////////
///////////////////////////

export interface EraseToolContext {
	store: StrokeStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getSvgElement: () => SVGSVGElement | null;
	onErase?: () => void;
}

let erasing = false;
let touchedStrokeIds: Set<string> = new Set();
let lastEraseClientPoint: ClientPoint | null = null;

export function eraseToolPointerDown(e: PointerEvent, ctx: EraseToolContext): void {
	erasing = true;
	touchedStrokeIds = new Set();
	lastEraseClientPoint = null;
	hitTestEraserAtClientPoint(e.clientX, e.clientY, null, ctx);
	lastEraseClientPoint = { x: e.clientX, y: e.clientY };
}

export function eraseToolPointerMove(e: PointerEvent, ctx: EraseToolContext): void {
	if (!erasing) return;
	hitTestEraserAtClientPoint(e.clientX, e.clientY, lastEraseClientPoint, ctx);
	lastEraseClientPoint = { x: e.clientX, y: e.clientY };
}

export function eraseToolPointerUp(_e: PointerEvent, ctx: EraseToolContext): void {
	if (!erasing) return;
	erasing = false;
	lastEraseClientPoint = null;

	const ids = Array.from(touchedStrokeIds);
	touchedStrokeIds = new Set();

	if (ids.length > 0) {
		const command = new RemoveStrokesCommand(ctx.store, ids);
		ctx.undoManager.execute(command);
		ctx.onErase?.();
	}
}

export function eraseToolPointerCancel(_e: PointerEvent, ctx: EraseToolContext): void {
	const svg = ctx.getSvgElement();
	if (svg && touchedStrokeIds.size > 0) {
		clearPendingErasePreview(svg, touchedStrokeIds);
	}
	erasing = false;
	lastEraseClientPoint = null;
	touchedStrokeIds = new Set();
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
		const strokeId = getStrokeIdAtClientPoint(svg, sample.x, sample.y);
		if (!strokeId) continue;
		markStrokeForErase(svg, strokeId);
	}
}

function getStrokeGroupElement(svg: SVGSVGElement, strokeId: string): SVGGElement | null {
	return svg.querySelector<SVGGElement>(
		`[data-stroke-group][data-stroke-id="${CSS.escape(strokeId)}"]`,
	);
}

function markStrokeForErase(svg: SVGSVGElement, strokeId: string): void {
	if (touchedStrokeIds.has(strokeId)) return;

	const strokeGroup = getStrokeGroupElement(svg, strokeId);
	if (!strokeGroup) return;

	touchedStrokeIds.add(strokeId);
	strokeGroup.classList.add(INK_STROKE_PENDING_ERASE_CLASS);
}

function clearPendingErasePreview(svg: SVGSVGElement, strokeIds: Iterable<string>): void {
	for (const strokeId of strokeIds) {
		const strokeGroup = getStrokeGroupElement(svg, strokeId);
		strokeGroup?.classList.remove(INK_STROKE_PENDING_ERASE_CLASS);
	}
}
