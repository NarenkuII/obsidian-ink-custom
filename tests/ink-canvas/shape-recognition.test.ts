import { recognizeInkShape } from '../../src/ink-canvas/shape-recognition';
import type { InkPoint } from '../../src/ink-canvas/types';

const p = (x: number, y: number): InkPoint => [x, y, 0.5];

describe('recognizeInkShape', () => {
	it('straightens a nearly straight line', () => {
		const result = recognizeInkShape([p(0, 0), p(25, 1), p(50, -1), p(100, 0)]);
		expect(result?.shape).toBe('line');
		expect(result?.points).toHaveLength(2);
	});

	it('recognizes a rectangle', () => {
		const result = recognizeInkShape([
			p(0, 0), p(50, 1), p(100, 0), p(99, 50), p(100, 100),
			p(50, 99), p(0, 100), p(1, 50), p(0, 0),
		]);
		expect(result?.shape).toBe('rectangle');
		expect(result?.points).toHaveLength(5);
	});

	it('recognizes an ellipse', () => {
		const points: InkPoint[] = [];
		for (let i = 0; i <= 24; i++) {
			const angle = i / 24 * Math.PI * 2;
			points.push(p(50 + Math.cos(angle) * 40, 50 + Math.sin(angle) * 25));
		}
		const result = recognizeInkShape(points);
		expect(result?.shape).toBe('ellipse');
	});
});
