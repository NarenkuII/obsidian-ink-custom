import { describe, expect, test } from '@jest/globals';
import { TransformStrokesCommand } from 'src/ink-canvas/commands';
import {
	applyPageTransform,
	rotationTransform,
	transformStroke,
	translationTransform,
	uniformScaleTransform,
} from 'src/ink-canvas/selection-transform';
import type { InkStroke } from 'src/ink-canvas/types';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';
import { StrokeStore } from 'src/ink-canvas/stroke-store';
import { UndoManager } from 'src/ink-canvas/undo-manager';

function makeStroke(): InkStroke {
	return {
		id: 'stroke',
		points: [[1, 2, 0.4], [3, 4, 0.8]],
		style: { ...DEFAULT_STROKE_STYLE, size: 5 },
		offset: { x: 10, y: 20 },
	};
}

describe('selection transforms', () => {
	test('translates page points', () => {
		expect(applyPageTransform({ x: 2, y: 3 }, translationTransform(5, -2)))
			.toEqual({ x: 7, y: 1 });
	});

	test('scales uniformly around the opposite corner', () => {
		const transform = uniformScaleTransform({ x: 10, y: 10 }, 2);
		expect(applyPageTransform({ x: 12, y: 13 }, transform))
			.toEqual({ x: 14, y: 16 });
	});

	test('rotates around selection center', () => {
		const transform = rotationTransform({ x: 10, y: 10 }, Math.PI / 2);
		const point = applyPageTransform({ x: 12, y: 10 }, transform);
		expect(point.x).toBeCloseTo(10);
		expect(point.y).toBeCloseTo(12);
	});

	test('flattens offsets into transformed points and scales pen width', () => {
		const transformed = transformStroke(
			makeStroke(),
			uniformScaleTransform({ x: 0, y: 0 }, 2),
		);
		expect(transformed.points).toEqual([[22, 44, 0.4], [26, 48, 0.8]]);
		expect(transformed.offset).toEqual({ x: 0, y: 0 });
		expect(transformed.style.size).toBe(10);
	});

	test('applies scale/rotation geometry as one undoable operation', () => {
		const store = new StrokeStore();
		const undoManager = new UndoManager();
		const original = makeStroke();
		const transformed = transformStroke(original, uniformScaleTransform({ x: 0, y: 0 }, 2));
		store.add(original);

		undoManager.execute(new TransformStrokesCommand(store, [original], [transformed]));
		expect(store.getById('stroke')).toEqual(transformed);

		undoManager.undo();
		expect(store.getById('stroke')).toEqual(original);

		undoManager.redo();
		expect(store.getById('stroke')).toEqual(transformed);
	});
});
