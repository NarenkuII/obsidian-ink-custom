import { activeStrokeSelectionContainsPointer, type SelectToolContext } from '../../src/ink-canvas/tools/select-tool';
import { StrokeStore } from '../../src/ink-canvas/stroke-store';
import { UndoManager } from '../../src/ink-canvas/undo-manager';
import { DEFAULT_STROKE_STYLE, type InkStroke } from '../../src/ink-canvas/types';

describe('stroke selection pointer priority', () => {
	it('keeps the selected stroke frame interactive when an image is underneath', () => {
		const store = new StrokeStore();
		const stroke: InkStroke = {
			id: 'selected-writing',
			points: [[10, 10, 0.5], [50, 18, 0.5], [90, 10, 0.5]],
			style: { ...DEFAULT_STROKE_STYLE },
			offset: { x: 0, y: 0 },
		};
		store.add(stroke);
		const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
		image.setAttribute('data-ink-image-id', 'background-image');
		const ctx: SelectToolContext = {
			store,
			undoManager: new UndoManager(),
			getCamera: () => ({ x: 0, y: 0, zoom: 1 }),
			getContainerRect: () => ({ left: 0, top: 0, width: 500, height: 500 } as DOMRect),
			getSvgElement: () => null,
			getSelectedStrokeIds: () => new Set([stroke.id]),
			getSelectionAspectRatioLocked: () => true,
			setSelectedStrokeIds: jest.fn(),
		};
		const event = { clientX: 50, clientY: 14, target: image } as unknown as PointerEvent;
		expect(activeStrokeSelectionContainsPointer(event, ctx)).toBe(true);
	});
});
