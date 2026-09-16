import { screenToPage } from '../camera';
import { MoveStrokesCommand, TransformStrokesCommand } from '../commands';
import {
	IDENTITY_PAGE_TRANSFORM,
	nonUniformScaleTransform,
	rotationTransform,
	svgMatrixForStroke,
	transformStroke,
	type PagePoint,
	type PageTransform,
	uniformScaleTransform,
} from '../selection-transform';
import type { StrokeStore } from '../stroke-store';
import { computeStrokesBounds, type StrokeBounds } from '../svg-export';
import type { CameraState, InkStroke } from '../types';
import type { UndoManager } from '../undo-manager';
import { getStrokeIdAtClientPoint } from '../utils/stroke-hit-test';
import { getStraightLineSelection, type StraightLineSelection } from '../line-selection';

///////////////////////////
///////////////////////////

export interface SelectToolContext {
	store: StrokeStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getSvgElement: () => SVGSVGElement | null;
	getSelectedStrokeIds: () => Set<string>;
	getSelectionAspectRatioLocked: () => boolean;
	setSelectedStrokeIds: (ids: Set<string>) => void;
	onSelectionChange?: () => void;
}

type SelectPhase = 'idle' | 'marquee' | 'dragging' | 'scaling' | 'rotating' | 'line-resizing';
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

let phase: SelectPhase = 'idle';

// Marquee state
let marqueeStart: { x: number; y: number } | null = null;
let marqueeCurrent: { x: number; y: number } | null = null;

// Drag state
let dragStartPage: { x: number; y: number } | null = null;
let dragAccumulatedDelta = { x: 0, y: 0 };

interface TransformGesture {
	initialStrokes: InkStroke[];
	anchor: PagePoint;
	initialVector: PagePoint;
	currentTransform: PageTransform;
}

let transformGesture: TransformGesture | null = null;

const FRAME_PADDING_PX = 6;
const HANDLE_HIT_RADIUS_PX = 18;
const ROTATE_HANDLE_OFFSET_PX = 30;
const MIN_SELECTION_SCALE = 0.1;
const MAX_SELECTION_SCALE = 10;

export function activeStrokeSelectionContainsPointer(e: PointerEvent, ctx: SelectToolContext): boolean {
	if (ctx.getSelectedStrokeIds().size === 0) return false;
	const camera = ctx.getCamera();
	const pagePoint = screenToPage(camera, ctx.getContainerRect(), e.clientX, e.clientY);
	const selectedStrokes = getSelectedStrokes(ctx);
	if (selectedStrokes.length === 0) return false;
	const line = getStraightLineSelection(selectedStrokes);
	if (line) return hitTestLineHandle(pagePoint, line, camera.zoom) !== null;
	const bounds = computeStrokesBounds(selectedStrokes);
	return hitTestSelectionHandle(pagePoint, bounds, camera.zoom) !== null
		|| pointInSelectionFrame(pagePoint, bounds, camera.zoom);
}


export function selectToolPointerDown(e: PointerEvent, ctx: SelectToolContext): void {
	const camera = ctx.getCamera();
	const containerRect = ctx.getContainerRect();
	const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);

	const selected = ctx.getSelectedStrokeIds();

	// Handles and the whole selected frame are intentionally easy to hit on a tablet.
	if (selected.size > 0) {
		const selectedStrokes = getSelectedStrokes(ctx);
		if (selectedStrokes.length > 0) {
			const line = getStraightLineSelection(selectedStrokes);
			if (line) {
				const lineHandle = hitTestLineHandle(pagePoint, line, camera.zoom);
				if (lineHandle === 'middle') {
					beginDrag(pagePoint);
					return;
				}
				if (lineHandle === 'start' || lineHandle === 'end') {
					beginLineResize(lineHandle, line);
					return;
				}
			}
			if (!line) {
				const bounds = computeStrokesBounds(selectedStrokes);
				const handle = hitTestSelectionHandle(pagePoint, bounds, camera.zoom);
				if (handle === 'rotate') {
					beginRotation(pagePoint, selectedStrokes, bounds);
					return;
				}
				if (handle !== null) {
					beginScale(handle, selectedStrokes, bounds, camera.zoom);
					return;
				}
				if (pointInSelectionFrame(pagePoint, bounds, camera.zoom)) {
					beginDrag(pagePoint);
					return;
				}
			}
		}

		const hitId = hitTestSingleStroke(e, ctx);
		if (hitId && selected.has(hitId)) {
			beginDrag(pagePoint);
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

	if ((phase === 'scaling' || phase === 'rotating' || phase === 'line-resizing') && transformGesture) {
		const camera = ctx.getCamera();
		const containerRect = ctx.getContainerRect();
		const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);
		const gesture = transformGesture;

		if (phase === 'scaling') {
			const currentVector = {
				x: pagePoint.x - gesture.anchor.x,
				y: pagePoint.y - gesture.anchor.y,
			};
			if (ctx.getSelectionAspectRatioLocked()) {
				const denominator = gesture.initialVector.x ** 2 + gesture.initialVector.y ** 2;
				const projectedScale = denominator > 0
					? (currentVector.x * gesture.initialVector.x + currentVector.y * gesture.initialVector.y) / denominator
					: 1;
				gesture.currentTransform = uniformScaleTransform(gesture.anchor, clampSelectionScale(projectedScale));
			} else {
				const scaleX = gesture.initialVector.x === 0 ? 1 : clampSelectionScale(currentVector.x / gesture.initialVector.x);
				const scaleY = gesture.initialVector.y === 0 ? 1 : clampSelectionScale(currentVector.y / gesture.initialVector.y);
				gesture.currentTransform = nonUniformScaleTransform(gesture.anchor, scaleX, scaleY);
			}
		} else if (phase === 'rotating') {
			const center = gesture.anchor;
			const initialAngle = Math.atan2(gesture.initialVector.y, gesture.initialVector.x);
			const currentAngle = Math.atan2(pagePoint.y - center.y, pagePoint.x - center.x);
			let angle = currentAngle - initialAngle;
			if (e.shiftKey) {
				const snap = Math.PI / 12;
				angle = Math.round(angle / snap) * snap;
			}
			gesture.currentTransform = rotationTransform(center, angle);
		} else {
			gesture.currentTransform = similarityTransform(
				gesture.anchor,
				gesture.initialVector,
				{ x: pagePoint.x - gesture.anchor.x, y: pagePoint.y - gesture.anchor.y },
			);
		}

		previewSelectionTransform(ctx, gesture);
		return;
	}
}

function clampSelectionScale(scale: number): number {
	return Math.min(MAX_SELECTION_SCALE, Math.max(MIN_SELECTION_SCALE, scale));
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

	if (phase === 'scaling' || phase === 'rotating' || phase === 'line-resizing') {
		finishTransform(ctx);
		phase = 'idle';
	}
}

export function selectToolPointerCancel(_e: PointerEvent, ctx: SelectToolContext): void {
	resetSelectionPreview(ctx);
	phase = 'idle';
	marqueeStart = null;
	marqueeCurrent = null;
	dragStartPage = null;
	dragAccumulatedDelta = { x: 0, y: 0 };
	transformGesture = null;
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

function beginDrag(pagePoint: PagePoint): void {
	phase = 'dragging';
	dragStartPage = pagePoint;
	dragAccumulatedDelta = { x: 0, y: 0 };
}

function finishDrag(ctx: SelectToolContext): void {
	if (dragAccumulatedDelta.x === 0 && dragAccumulatedDelta.y === 0) {
		ctx.getSvgElement()?.querySelector<SVGGElement>('.ink-canvas-selection-frame')?.removeAttribute('transform');
		ctx.getSvgElement()?.querySelector<SVGGElement>('.ink-canvas-line-selection')?.removeAttribute('transform');
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
	ctx.getSvgElement()?.querySelector<SVGGElement>('.ink-canvas-selection-frame')?.removeAttribute('transform');
	ctx.getSvgElement()?.querySelector<SVGGElement>('.ink-canvas-line-selection')?.removeAttribute('transform');
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

	const frame = svg.querySelector<SVGGElement>('.ink-canvas-selection-frame');
	if (frame) frame.setAttribute('transform', `translate(${dragAccumulatedDelta.x + dx} ${dragAccumulatedDelta.y + dy})`);
	const lineFrame = svg.querySelector<SVGGElement>('.ink-canvas-line-selection');
	if (lineFrame) lineFrame.setAttribute('transform', `translate(${dragAccumulatedDelta.x + dx} ${dragAccumulatedDelta.y + dy})`);
}


// Scale / rotate helpers
///////////////////////////

function getSelectedStrokes(ctx: SelectToolContext): InkStroke[] {
	const selected = ctx.getSelectedStrokeIds();
	return Array.from(selected)
		.map((id) => ctx.store.getById(id))
		.filter((stroke): stroke is InkStroke => stroke !== undefined);
}

function frameBounds(bounds: StrokeBounds, zoom: number): StrokeBounds {
	const padding = FRAME_PADDING_PX / zoom;
	return {
		minX: bounds.minX - padding,
		minY: bounds.minY - padding,
		maxX: bounds.maxX + padding,
		maxY: bounds.maxY + padding,
		width: bounds.width + padding * 2,
		height: bounds.height + padding * 2,
	};
}

function pointInSelectionFrame(point: PagePoint, bounds: StrokeBounds, zoom: number): boolean {
	const frame = frameBounds(bounds, zoom);
	return point.x >= frame.minX && point.x <= frame.maxX
		&& point.y >= frame.minY && point.y <= frame.maxY;
}

function hitTestSelectionHandle(
	point: PagePoint,
	bounds: StrokeBounds,
	zoom: number,
): Corner | 'rotate' | null {
	const frame = frameBounds(bounds, zoom);
	const radius = HANDLE_HIT_RADIUS_PX / zoom;
	const centerX = (frame.minX + frame.maxX) / 2;
	const handles: Array<{ kind: Corner | 'rotate'; point: PagePoint }> = [
		{ kind: 'top-left', point: { x: frame.minX, y: frame.minY } },
		{ kind: 'top-right', point: { x: frame.maxX, y: frame.minY } },
		{ kind: 'bottom-left', point: { x: frame.minX, y: frame.maxY } },
		{ kind: 'bottom-right', point: { x: frame.maxX, y: frame.maxY } },
		{ kind: 'rotate', point: { x: centerX, y: frame.minY - ROTATE_HANDLE_OFFSET_PX / zoom } },
	];

	let closest: { kind: Corner | 'rotate'; distance: number } | null = null;
	for (const handle of handles) {
		const distance = Math.hypot(point.x - handle.point.x, point.y - handle.point.y);
		if (distance <= radius && (!closest || distance < closest.distance)) {
			closest = { kind: handle.kind, distance };
		}
	}
	return closest?.kind ?? null;
}

function cornerPoint(corner: Corner, frame: StrokeBounds): PagePoint {
	return {
		x: corner.endsWith('left') ? frame.minX : frame.maxX,
		y: corner.startsWith('top') ? frame.minY : frame.maxY,
	};
}

function oppositeCorner(corner: Corner): Corner {
	if (corner === 'top-left') return 'bottom-right';
	if (corner === 'top-right') return 'bottom-left';
	if (corner === 'bottom-left') return 'top-right';
	return 'top-left';
}

function beginScale(
	corner: Corner,
	strokes: InkStroke[],
	bounds: StrokeBounds,
	zoom: number,
): void {
	const frame = frameBounds(bounds, zoom);
	const anchor = cornerPoint(oppositeCorner(corner), frame);
	const handle = cornerPoint(corner, frame);
	phase = 'scaling';
	transformGesture = {
		initialStrokes: strokes,
		anchor,
		initialVector: { x: handle.x - anchor.x, y: handle.y - anchor.y },
		currentTransform: IDENTITY_PAGE_TRANSFORM,
	};
}

function beginRotation(pagePoint: PagePoint, strokes: InkStroke[], bounds: StrokeBounds): void {
	const center = {
		x: (bounds.minX + bounds.maxX) / 2,
		y: (bounds.minY + bounds.maxY) / 2,
	};
	phase = 'rotating';
	transformGesture = {
		initialStrokes: strokes,
		anchor: center,
		initialVector: { x: pagePoint.x - center.x, y: pagePoint.y - center.y },
		currentTransform: IDENTITY_PAGE_TRANSFORM,
	};
}

function beginLineResize(handle: 'start' | 'end', line: StraightLineSelection): void {
	const moving = handle === 'start' ? line.start : line.end;
	const fixed = handle === 'start' ? line.end : line.start;
	phase = 'line-resizing';
	transformGesture = {
		initialStrokes: [line.stroke],
		anchor: fixed,
		initialVector: { x: moving.x - fixed.x, y: moving.y - fixed.y },
		currentTransform: IDENTITY_PAGE_TRANSFORM,
	};
}

function similarityTransform(anchor: PagePoint, initial: PagePoint, current: PagePoint): PageTransform {
	const initialLength = Math.hypot(initial.x, initial.y);
	const currentLength = Math.hypot(current.x, current.y);
	if (initialLength === 0 || currentLength === 0) return IDENTITY_PAGE_TRANSFORM;
	const scale = Math.min(MAX_SELECTION_SCALE, Math.max(MIN_SELECTION_SCALE, currentLength / initialLength));
	const angle = Math.atan2(current.y, current.x) - Math.atan2(initial.y, initial.x);
	const cos = Math.cos(angle) * scale;
	const sin = Math.sin(angle) * scale;
	return {
		a: cos,
		b: sin,
		c: -sin,
		d: cos,
		e: anchor.x - cos * anchor.x + sin * anchor.y,
		f: anchor.y - sin * anchor.x - cos * anchor.y,
		strokeScale: scale,
	};
}

function previewSelectionTransform(ctx: SelectToolContext, gesture: TransformGesture): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;
	for (const stroke of gesture.initialStrokes) {
		const group = svg.querySelector<SVGGElement>(`[data-stroke-group][data-stroke-id="${stroke.id}"]`);
		group?.setAttribute('transform', svgMatrixForStroke(stroke, gesture.currentTransform));
	}
	const frame = svg.querySelector<SVGGElement>('.ink-canvas-selection-frame');
	if (frame) {
		const t = gesture.currentTransform;
		frame.setAttribute('transform', `matrix(${t.a} ${t.b} ${t.c} ${t.d} ${t.e} ${t.f})`);
	}
	const lineFrame = svg.querySelector<SVGGElement>('.ink-canvas-line-selection');
	if (lineFrame) {
		const t = gesture.currentTransform;
		lineFrame.setAttribute('transform', `matrix(${t.a} ${t.b} ${t.c} ${t.d} ${t.e} ${t.f})`);
	}
}

function resetSelectionPreview(ctx: SelectToolContext): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;
	const strokes = transformGesture?.initialStrokes ?? getSelectedStrokes(ctx);
	for (const stroke of strokes) {
		const group = svg.querySelector<SVGGElement>(`[data-stroke-group][data-stroke-id="${stroke.id}"]`);
		if (!group) continue;
		if (stroke.offset.x === 0 && stroke.offset.y === 0) group.removeAttribute('transform');
		else group.setAttribute('transform', `translate(${stroke.offset.x}, ${stroke.offset.y})`);
		group.setAttribute('data-offset-x', String(stroke.offset.x));
		group.setAttribute('data-offset-y', String(stroke.offset.y));
	}
	svg.querySelector<SVGGElement>('.ink-canvas-selection-frame')?.removeAttribute('transform');
	svg.querySelector<SVGGElement>('.ink-canvas-line-selection')?.removeAttribute('transform');
}

function hitTestLineHandle(
	point: PagePoint,
	line: StraightLineSelection,
	zoom: number,
): 'start' | 'middle' | 'end' | null {
	const radius = HANDLE_HIT_RADIUS_PX / zoom;
	const handles = [
		{ kind: 'start' as const, point: line.start },
		{ kind: 'middle' as const, point: line.middle },
		{ kind: 'end' as const, point: line.end },
	];
	let closest: { kind: 'start' | 'middle' | 'end'; distance: number } | null = null;
	for (const handle of handles) {
		const distance = Math.hypot(point.x - handle.point.x, point.y - handle.point.y);
		if (distance <= radius && (!closest || distance < closest.distance)) closest = { kind: handle.kind, distance };
	}
	return closest?.kind ?? null;
}

function finishTransform(ctx: SelectToolContext): void {
	const gesture = transformGesture;
	if (!gesture) return;
	resetSelectionPreview(ctx);
	const transform = gesture.currentTransform;
	const unchanged = transform.a === 1 && transform.b === 0 && transform.c === 0
		&& transform.d === 1 && transform.e === 0 && transform.f === 0;
	if (!unchanged) {
		const transformed = gesture.initialStrokes.map((stroke) => transformStroke(stroke, transform));
		ctx.undoManager.execute(new TransformStrokesCommand(ctx.store, gesture.initialStrokes, transformed));
	}
	transformGesture = null;
}


// Hit-test helper
///////////////////////////

function hitTestSingleStroke(e: PointerEvent, ctx: SelectToolContext): string | null {
	const svg = ctx.getSvgElement();
	if (!svg) return null;

	return getStrokeIdAtClientPoint(svg, e.clientX, e.clientY);
}
