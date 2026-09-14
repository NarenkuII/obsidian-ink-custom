import { screenToPage } from '../camera';
import { MoveStrokesCommand } from '../commands';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import type { CameraState } from '../types';
import { getStrokeIdAtClientPoint } from '../utils/stroke-hit-test';

///////////////////////////
///////////////////////////

export interface SelectToolContext {
	store: StrokeStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getSvgElement: () => SVGSVGElement | null;
	getSelectedStrokeIds: () => Set<string>;
	setSelectedStrokeIds: (ids: Set<string>) => void;
	onSelectionChange?: () => void;
}

type SelectPhase = 'idle' | 'marquee' | 'dragging';

let phase: SelectPhase = 'idle';

// Marquee state
let marqueeStart: { x: number; y: number } | null = null;
let marqueeCurrent: { x: number; y: number } | null = null;

// Drag state
let dragStartPage: { x: number; y: number } | null = null;
let dragAccumulatedDelta = { x: 0, y: 0 };


export function selectToolPointerDown(e: PointerEvent, ctx: SelectToolContext): void {
	const camera = ctx.getCamera();
	const containerRect = ctx.getContainerRect();
	const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);

	const selected = ctx.getSelectedStrokeIds();

	// Check if clicking on an already-selected stroke to start a drag
	if (selected.size > 0) {
		const hitId = hitTestSingleStroke(e, ctx);
		if (hitId && selected.has(hitId)) {
			phase = 'dragging';
			dragStartPage = pagePoint;
			dragAccumulatedDelta = { x: 0, y: 0 };
			return;
		}
	}

	// Otherwise, start a rectangular marquee like the legacy tldraw selector.
	phase = 'marquee';
	marqueeStart = pagePoint;
	marqueeCurrent = pagePoint;

	// Clear previous selection unless Shift is held
	if (!e.shiftKey) {
		ctx.setSelectedStrokeIds(new Set());
		ctx.onSelectionChange?.();
	}
}

export function selectToolPointerMove(e: PointerEvent, ctx: SelectToolContext): void {
	if (phase === 'marquee') {
		const camera = ctx.getCamera();
		const containerRect = ctx.getContainerRect();
		const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);
		marqueeCurrent = pagePoint;
		updateMarqueeVisual(ctx);
		return;
	}

	if (phase === 'dragging') {
		const camera = ctx.getCamera();
		const containerRect = ctx.getContainerRect();
		const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);
		if (!dragStartPage) return;

		const dx = pagePoint.x - dragStartPage.x;
		const dy = pagePoint.y - dragStartPage.y;

		// Move selection visuals imperatively
		const delta = {
			x: dx - dragAccumulatedDelta.x,
			y: dy - dragAccumulatedDelta.y,
		};
		moveSelectionVisuals(ctx, delta.x, delta.y);
		dragAccumulatedDelta = { x: dx, y: dy };
		return;
	}
}

export function selectToolPointerUp(_e: PointerEvent, ctx: SelectToolContext): void {
	if (phase === 'marquee') {
		finishMarquee(_e, ctx);
		phase = 'idle';
		return;
	}

	if (phase === 'dragging') {
		finishDrag(ctx);
		phase = 'idle';
		return;
	}
}

export function selectToolPointerCancel(_e: PointerEvent, ctx: SelectToolContext): void {
	phase = 'idle';
	marqueeStart = null;
	marqueeCurrent = null;
	dragStartPage = null;
	clearMarqueeVisual(ctx);
}

export function isSelectToolActive(): boolean {
	return phase !== 'idle';
}


// Marquee helpers
///////////////////////////

function finishMarquee(e: PointerEvent, ctx: SelectToolContext): void {
	if (!marqueeStart || !marqueeCurrent) return;
	const marquee = normalizedRect(marqueeStart, marqueeCurrent);
	if (marquee.width < 3 && marquee.height < 3) {
		// A short gesture is a click / tap select.
		// Use exact path hit testing so tapping empty space reliably deselects.
		handleTapSelect(e, ctx);
		clearMarqueeVisual(ctx);
		marqueeStart = null;
		marqueeCurrent = null;
		return;
	}

	const allStrokes = ctx.store.getAll();
	const selected = new Set(ctx.getSelectedStrokeIds());

	for (const stroke of allStrokes) {
		if (strokeIntersectsRect(stroke, marquee)) selected.add(stroke.id);
	}

	ctx.setSelectedStrokeIds(selected);
	ctx.onSelectionChange?.();

	clearMarqueeVisual(ctx);
	marqueeStart = null;
	marqueeCurrent = null;
}

function handleTapSelect(e: PointerEvent, ctx: SelectToolContext): void {
	const hitId = hitTestSingleStroke(e, ctx);
	const next = new Set(ctx.getSelectedStrokeIds());

	if (hitId) {
		if (e.shiftKey) {
			if (next.has(hitId)) next.delete(hitId);
			else next.add(hitId);
		} else {
			next.clear();
			next.add(hitId);
		}
		ctx.setSelectedStrokeIds(next);
		ctx.onSelectionChange?.();
		return;
	}

	if (!e.shiftKey) {
		ctx.setSelectedStrokeIds(new Set());
		ctx.onSelectionChange?.();
	}
}

interface SelectionRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

function normalizedRect(
	start: { x: number; y: number },
	end: { x: number; y: number },
): SelectionRect {
	return {
		x: Math.min(start.x, end.x),
		y: Math.min(start.y, end.y),
		width: Math.abs(end.x - start.x),
		height: Math.abs(end.y - start.y),
	};
}

function strokeIntersectsRect(
	stroke: { points: Array<[number, number, number]>; offset: { x: number; y: number } },
	rect: SelectionRect,
): boolean {
	if (stroke.points.length === 0) return false;

	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const pt of stroke.points) {
		const px = pt[0] + stroke.offset.x;
		const py = pt[1] + stroke.offset.y;
		if (px < minX) minX = px;
		if (py < minY) minY = py;
		if (px > maxX) maxX = px;
		if (py > maxY) maxY = py;
	}
	return maxX >= rect.x
		&& minX <= rect.x + rect.width
		&& maxY >= rect.y
		&& minY <= rect.y + rect.height;
}

function updateMarqueeVisual(ctx: SelectToolContext): void {
	const svg = ctx.getSvgElement();
	if (!svg || !marqueeStart || !marqueeCurrent) return;

	let marqueeEl = svg.querySelector<SVGRectElement>('.ink-canvas-marquee');
	if (!marqueeEl) {
		marqueeEl = svg.createSvg('rect');
		marqueeEl.classList.add('ink-canvas-marquee');
		marqueeEl.setAttribute('fill', 'rgba(0, 123, 255, 0.08)');
		marqueeEl.setAttribute('stroke', 'rgba(0, 123, 255, 0.65)');
		marqueeEl.setAttribute('stroke-width', '1');
		marqueeEl.setAttribute('stroke-dasharray', '4 2');
	}

	const camera = ctx.getCamera();
	const rect = normalizedRect(marqueeStart, marqueeCurrent);
	marqueeEl.setAttribute('x', String((rect.x + camera.x) * camera.zoom));
	marqueeEl.setAttribute('y', String((rect.y + camera.y) * camera.zoom));
	marqueeEl.setAttribute('width', String(rect.width * camera.zoom));
	marqueeEl.setAttribute('height', String(rect.height * camera.zoom));
}

function clearMarqueeVisual(ctx: SelectToolContext): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;
	svg.querySelector('.ink-canvas-marquee')?.remove();
}


// Drag helpers
///////////////////////////

function finishDrag(ctx: SelectToolContext): void {
	if (dragAccumulatedDelta.x === 0 && dragAccumulatedDelta.y === 0) {
		dragStartPage = null;
		return;
	}

	const selected = ctx.getSelectedStrokeIds();
	if (selected.size === 0) {
		dragStartPage = null;
		return;
	}

	const ids = Array.from(selected);
	const command = new MoveStrokesCommand(
		ctx.store,
		ids,
		dragAccumulatedDelta.x,
		dragAccumulatedDelta.y,
	);
	ctx.undoManager.execute(command);

	dragStartPage = null;
	dragAccumulatedDelta = { x: 0, y: 0 };
}

/** Imperatively translate selected stroke group elements during drag. */
function moveSelectionVisuals(ctx: SelectToolContext, dx: number, dy: number): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;

	const selected = ctx.getSelectedStrokeIds();
	for (const id of selected) {
		const group = svg.querySelector<SVGGElement>(`[data-stroke-group][data-stroke-id="${id}"]`);
		if (!group) continue;

		const currentX = parseFloat(group.getAttribute('data-offset-x') || '0');
		const currentY = parseFloat(group.getAttribute('data-offset-y') || '0');
		const newX = currentX + dx;
		const newY = currentY + dy;
		group.setAttribute('transform', `translate(${newX}, ${newY})`);
		group.setAttribute('data-offset-x', String(newX));
		group.setAttribute('data-offset-y', String(newY));
	}
}


// Hit-test helper
///////////////////////////

function hitTestSingleStroke(e: PointerEvent, ctx: SelectToolContext): string | null {
	const svg = ctx.getSvgElement();
	if (!svg) return null;

	return getStrokeIdAtClientPoint(svg, e.clientX, e.clientY);
}
