import {
	drawToolPointerCancel,
	drawToolPointerDown,
	drawToolPointerMove,
	drawToolPointerUp,
	type DrawToolContext,
} from '../../src/ink-canvas/tools/draw-tool';
import { StrokeStore } from '../../src/ink-canvas/stroke-store';
import { UndoManager } from '../../src/ink-canvas/undo-manager';
import { DEFAULT_STROKE_STYLE } from '../../src/ink-canvas/types';

function pointer(clientX: number, clientY: number, timeStamp: number): PointerEvent {
	return {
		clientX,
		clientY,
		timeStamp,
		pressure: 0.5,
		pointerType: 'pen',
	} as PointerEvent;
}

describe('draw tool live shape preview', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it('snaps a held line before pointerup and commits the preview geometry', () => {
		jest.useFakeTimers();
		const store = new StrokeStore();
		const livePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		const ctx: DrawToolContext = {
			store,
			undoManager: new UndoManager(),
			getCamera: () => ({ x: 0, y: 0, zoom: 1 }),
			getContainerRect: () => ({ left: 0, top: 0, width: 500, height: 500 } as DOMRect),
			getStrokeStyle: () => ({ ...DEFAULT_STROKE_STYLE }),
			getPenStabilization: () => 0.15,
			getShapeRecognitionEnabled: () => true,
			getStrokeInputTreatAsPreference: () => 'pen',
			getResolvedStrokeInputTreatAs: () => 'pen',
			getLiveStrokePath: () => livePath,
		};

		drawToolPointerDown(pointer(0, 5, 0), ctx);
		drawToolPointerMove(pointer(25, 6, 10), ctx);
		drawToolPointerMove(pointer(50, 4, 20), ctx);
		drawToolPointerMove(pointer(100, 8, 30), ctx);
		const freehandPath = livePath.getAttribute('d');

		jest.advanceTimersByTime(349);
		expect(livePath.getAttribute('d')).toBe(freehandPath);
		expect(store.count()).toBe(0);

		jest.advanceTimersByTime(1);
		expect(livePath.getAttribute('d')).not.toBe(freehandPath);

		drawToolPointerUp(pointer(100, 8, 380), ctx);
		const stroke = store.getAll()[0];
		expect(stroke.points).toHaveLength(2);
		expect(stroke.points[0].slice(0, 2)).toEqual([0, 5]);
		expect(stroke.points[1][1]).toBe(5);
		expect(livePath.getAttribute('d')).toBe('');

		drawToolPointerCancel(pointer(100, 8, 381), ctx);
	});
});
