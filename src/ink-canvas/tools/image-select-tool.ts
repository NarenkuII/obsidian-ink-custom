import { screenToPage } from '../camera';
import { TransformImageCommand } from '../commands';
import type { ImageStore } from '../image-store';
import type { CameraState, InkImage } from '../types';
import type { UndoManager } from '../undo-manager';

export interface ImageSelectToolContext {
	store: ImageStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getSvgElement: () => SVGSVGElement | null;
	getSelectedImageIds: () => Set<string>;
	setSelectedImageIds: (ids: Set<string>) => void;
	clearStrokeSelection: () => void;
}

type ImageGestureMode = 'drag' | 'scale' | 'rotate';

interface ImageGesture {
	mode: ImageGestureMode;
	before: InkImage;
	start: { x: number; y: number };
	initialDistance: number;
	initialAngle: number;
	after: InkImage;
}

let gesture: ImageGesture | null = null;
let pendingLongPress: {
	timer: number;
	image: InkImage;
	start: { x: number; y: number };
} | null = null;
const HANDLE_RADIUS_PX = 20;
const ROTATE_OFFSET_PX = 34;
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export function imageSelectPointerDown(e: PointerEvent, ctx: ImageSelectToolContext): boolean {
	const point = screenToPage(ctx.getCamera(), ctx.getContainerRect(), e.clientX, e.clientY);
	const selectedId = Array.from(ctx.getSelectedImageIds())[0];
	const selected = selectedId ? ctx.store.getById(selectedId) : undefined;
	if (selected) {
		const handle = hitHandle(point, selected, ctx.getCamera().zoom);
		if (handle) {
			beginGesture(handle, selected, point);
			return true;
		}
		if (pointInsideImage(point, selected)) {
			beginGesture('drag', selected, point);
			return true;
		}
	}

	const target = e.target as Element | null;
	const imageElement = target?.closest?.('[data-ink-image-id]');
	const imageId = imageElement?.getAttribute('data-ink-image-id');
	const image = imageId ? ctx.store.getById(imageId) : undefined;
	if (!image) return false;
	cancelPendingLongPress();
	pendingLongPress = {
		image,
		start: point,
		timer: window.setTimeout(() => {
			const pending = pendingLongPress;
			if (!pending || pending.image.id !== image.id) return;
			pendingLongPress = null;
			ctx.clearStrokeSelection();
			ctx.setSelectedImageIds(new Set([image.id]));
			beginGesture('drag', image, pending.start);
		}, LONG_PRESS_MS),
	};
	return true;
}

export function imageSelectPointerMove(e: PointerEvent, ctx: ImageSelectToolContext): boolean {
	if (pendingLongPress) {
		const point = screenToPage(ctx.getCamera(), ctx.getContainerRect(), e.clientX, e.clientY);
		const distance = Math.hypot(point.x - pendingLongPress.start.x, point.y - pendingLongPress.start.y);
		if (distance > LONG_PRESS_MOVE_TOLERANCE_PX / ctx.getCamera().zoom) cancelPendingLongPress();
		return true;
	}
	if (!gesture) return false;
	const point = screenToPage(ctx.getCamera(), ctx.getContainerRect(), e.clientX, e.clientY);
	const before = gesture.before;
	if (gesture.mode === 'drag') {
		gesture.after = {
			...before,
			x: before.x + point.x - gesture.start.x,
			y: before.y + point.y - gesture.start.y,
		};
	} else if (gesture.mode === 'scale') {
		const center = imageCenter(before);
		const currentDistance = Math.hypot(point.x - center.x, point.y - center.y);
		const scale = Math.max(0.08, Math.min(12, currentDistance / Math.max(1, gesture.initialDistance)));
		const width = before.width * scale;
		const height = before.height * scale;
		gesture.after = { ...before, x: center.x - width / 2, y: center.y - height / 2, width, height };
	} else {
		const center = imageCenter(before);
		const angle = Math.atan2(point.y - center.y, point.x - center.x);
		let deltaDegrees = (angle - gesture.initialAngle) * 180 / Math.PI;
		if (e.shiftKey) deltaDegrees = Math.round(deltaDegrees / 15) * 15;
		gesture.after = { ...before, rotation: before.rotation + deltaDegrees };
	}
	previewImage(ctx, gesture.after);
	return true;
}

export function imageSelectPointerUp(ctx: ImageSelectToolContext): boolean {
	if (pendingLongPress) {
		cancelPendingLongPress();
		return true;
	}
	if (!gesture) return false;
	const completed = gesture;
	gesture = null;
	resetPreview(ctx, completed.before);
	if (JSON.stringify(completed.before) !== JSON.stringify(completed.after)) {
		ctx.undoManager.execute(new TransformImageCommand(ctx.store, completed.before, completed.after));
	}
	return true;
}

export function imageSelectPointerCancel(ctx: ImageSelectToolContext): boolean {
	if (pendingLongPress) {
		cancelPendingLongPress();
		return true;
	}
	if (!gesture) return false;
	resetPreview(ctx, gesture.before);
	gesture = null;
	return true;
}

function cancelPendingLongPress(): void {
	if (!pendingLongPress) return;
	window.clearTimeout(pendingLongPress.timer);
	pendingLongPress = null;
}

function beginGesture(mode: ImageGestureMode, image: InkImage, point: { x: number; y: number }): void {
	const center = imageCenter(image);
	gesture = {
		mode,
		before: { ...image },
		after: { ...image },
		start: point,
		initialDistance: Math.hypot(point.x - center.x, point.y - center.y),
		initialAngle: Math.atan2(point.y - center.y, point.x - center.x),
	};
}

function hitHandle(point: { x: number; y: number }, image: InkImage, zoom: number): ImageGestureMode | null {
	const radius = HANDLE_RADIUS_PX / zoom;
	const localHandles = [
		{ x: 0, y: 0 }, { x: image.width, y: 0 },
		{ x: 0, y: image.height }, { x: image.width, y: image.height },
	];
	for (const handle of localHandles) {
		const world = localToWorld(handle, image);
		if (Math.hypot(point.x - world.x, point.y - world.y) <= radius) return 'scale';
	}
	const rotate = localToWorld({ x: image.width / 2, y: -ROTATE_OFFSET_PX / zoom }, image);
	return Math.hypot(point.x - rotate.x, point.y - rotate.y) <= radius ? 'rotate' : null;
}

function pointInsideImage(point: { x: number; y: number }, image: InkImage): boolean {
	const local = worldToLocal(point, image);
	return local.x >= 0 && local.x <= image.width && local.y >= 0 && local.y <= image.height;
}

function localToWorld(point: { x: number; y: number }, image: InkImage) {
	const center = { x: image.width / 2, y: image.height / 2 };
	const radians = image.rotation * Math.PI / 180;
	const dx = point.x - center.x;
	const dy = point.y - center.y;
	return {
		x: image.x + center.x + Math.cos(radians) * dx - Math.sin(radians) * dy,
		y: image.y + center.y + Math.sin(radians) * dx + Math.cos(radians) * dy,
	};
}

function worldToLocal(point: { x: number; y: number }, image: InkImage) {
	const center = imageCenter(image);
	const radians = -image.rotation * Math.PI / 180;
	const dx = point.x - center.x;
	const dy = point.y - center.y;
	return {
		x: image.width / 2 + Math.cos(radians) * dx - Math.sin(radians) * dy,
		y: image.height / 2 + Math.sin(radians) * dx + Math.cos(radians) * dy,
	};
}

function imageCenter(image: InkImage) {
	return { x: image.x + image.width / 2, y: image.y + image.height / 2 };
}

function imageTransform(image: InkImage): string {
	return `translate(${image.x} ${image.y}) rotate(${image.rotation} ${image.width / 2} ${image.height / 2})`;
}

function previewImage(ctx: ImageSelectToolContext, image: InkImage): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;
	const escapedId = CSS.escape(image.id);
	const imageGroup = svg.querySelector<SVGGElement>(`[data-ink-image-group][data-ink-image-id="${escapedId}"]`);
	imageGroup?.setAttribute('transform', imageTransform(image));
	const imageElement = imageGroup?.querySelector<SVGImageElement>('image');
	imageElement?.setAttribute('width', String(image.width));
	imageElement?.setAttribute('height', String(image.height));
	const frame = svg.querySelector<SVGGElement>('.ink-canvas-image-selection-frame');
	if (!frame) return;
	frame.setAttribute('transform', imageTransform(image));
	const border = frame.querySelector<SVGRectElement>('.ink-canvas-image-selection-border');
	border?.setAttribute('width', String(image.width));
	border?.setAttribute('height', String(image.height));
	const corners = [[0, 0], [image.width, 0], [0, image.height], [image.width, image.height]];
	frame.querySelectorAll<SVGCircleElement>('.ink-canvas-image-corner').forEach((circle, index) => {
		circle.setAttribute('cx', String(corners[index][0]));
		circle.setAttribute('cy', String(corners[index][1]));
	});
	frame.querySelector<SVGLineElement>('.ink-canvas-image-rotate-line')?.setAttribute('x1', String(image.width / 2));
	frame.querySelector<SVGLineElement>('.ink-canvas-image-rotate-line')?.setAttribute('x2', String(image.width / 2));
	frame.querySelector<SVGCircleElement>('.ink-canvas-image-rotate-handle')?.setAttribute('cx', String(image.width / 2));
}

function resetPreview(ctx: ImageSelectToolContext, image: InkImage): void {
	previewImage(ctx, image);
}
