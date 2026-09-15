import { splitStrokeByEraserPath } from '../../src/ink-canvas/precise-eraser';
import type { InkStroke } from '../../src/ink-canvas/types';

function stroke(points: Array<[number, number, number]>): InkStroke {
	return {
		id: 'stroke',
		points,
		style: { size: 4, thinning: 0, smoothing: 0, streamline: 0, simulatePressure: false, color: '#000000' },
		offset: { x: 0, y: 0 },
	};
}

describe('splitStrokeByEraserPath', () => {
	it('splits a stroke around the precise eraser path', () => {
		const fragments = splitStrokeByEraserPath(
			stroke([[0, 0, 0.5], [100, 0, 0.5]]),
			[{ x: 50, y: -10 }, { x: 50, y: 10 }],
			5,
		);
		expect(fragments).toHaveLength(2);
		expect(fragments[0].points.at(-1)![0]).toBeLessThan(50);
		expect(fragments[1].points[0][0]).toBeGreaterThan(50);
	});

	it('leaves an untouched stroke unchanged', () => {
		const original = stroke([[0, 0, 0.5], [100, 0, 0.5]]);
		expect(splitStrokeByEraserPath(original, [{ x: 50, y: 50 }], 5)).toEqual([original]);
	});
});
