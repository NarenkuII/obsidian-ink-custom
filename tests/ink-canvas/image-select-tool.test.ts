import { ImageStore } from '../../src/ink-canvas/image-store';
import {
	imageSelectPointerCancel,
	imageSelectPointerDown,
	imageSelectPointerMove,
	imageSelectPointerUp,
	type ImageSelectToolContext,
} from '../../src/ink-canvas/tools/image-select-tool';
import type { InkImage } from '../../src/ink-canvas/types';
import { UndoManager } from '../../src/ink-canvas/undo-manager';

function pointer(target: Element, clientX = 20, clientY = 20): PointerEvent {
	return { target, clientX, clientY, shiftKey: false } as unknown as PointerEvent;
}

function setup() {
	const store = new ImageStore();
	const image: InkImage = {
		id: 'image', dataUrl: 'data:image/png;base64,AA==',
		x: 0, y: 0, width: 100, height: 80, rotation: 0,
	};
	store.add(image);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	const imageElement = document.createElementNS('http://www.w3.org/2000/svg', 'image');
	imageElement.setAttribute('data-ink-image-id', image.id);
	svg.appendChild(imageElement);
	let selected = new Set<string>();
	const ctx: ImageSelectToolContext = {
		store,
		undoManager: new UndoManager(),
		getCamera: () => ({ x: 0, y: 0, zoom: 1 }),
		getContainerRect: () => ({ left: 0, top: 0, width: 500, height: 500 } as DOMRect),
		getSvgElement: () => svg,
		getSelectedImageIds: () => selected,
		setSelectedImageIds: (ids) => { selected = ids; },
		clearStrokeSelection: jest.fn(),
	};
	return { ctx, imageElement, getSelected: () => selected };
}

describe('image select long press', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it('does not select an image on a short tap', () => {
		const { ctx, imageElement, getSelected } = setup();
		expect(imageSelectPointerDown(pointer(imageElement), ctx)).toBe(true);
		expect(imageSelectPointerUp(ctx)).toBe(true);
		jest.runAllTimers();
		expect(getSelected().size).toBe(0);
	});

	it('selects after a long press and allows an undoable drag', () => {
		const { ctx, imageElement, getSelected } = setup();
		imageSelectPointerDown(pointer(imageElement), ctx);
		jest.advanceTimersByTime(350);
		expect(getSelected()).toEqual(new Set(['image']));
		expect(imageSelectPointerMove(pointer(imageElement, 45, 30), ctx)).toBe(true);
		expect(imageSelectPointerUp(ctx)).toBe(true);
		expect(ctx.store.getById('image')).toMatchObject({ x: 25, y: 10 });
		expect(ctx.undoManager.canUndo()).toBe(true);
		imageSelectPointerCancel(ctx);
	});

	it('finds an image geometrically when mobile WebKit targets the root SVG', () => {
		const { ctx, getSelected } = setup();
		const svg = ctx.getSvgElement()!;
		expect(imageSelectPointerDown(pointer(svg, 30, 30), ctx)).toBe(true);
		jest.advanceTimersByTime(350);
		expect(getSelected()).toEqual(new Set(['image']));
		expect(imageSelectPointerUp(ctx)).toBe(true);
	});
});
