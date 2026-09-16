import { recognizeInkShape } from '../../src/ink-canvas/shape-recognition';
import type { InkPoint } from '../../src/ink-canvas/types';

const p = (x: number, y: number): InkPoint => [x, y, 0.5];

describe('recognizeInkShape', () => {
	it('straightens a nearly straight line', () => {
		const result = recognizeInkShape([p(0, 5), p(25, 6), p(50, 4), p(100, 8)]);
		expect(result?.shape).toBe('line');
		expect(result?.points).toHaveLength(2);
		expect(result?.points[0].slice(0, 2)).toEqual([0, 5]);
		expect(result?.points[1][1]).toBe(5);
	});

	it('snaps a nearly vertical line while keeping its start fixed', () => {
		const result = recognizeInkShape([p(12, 3), p(13, 40), p(10, 80), p(15, 103)]);
		expect(result?.shape).toBe('line');
		expect(result?.points[0].slice(0, 2)).toEqual([12, 3]);
		expect(result?.points[1][0]).toBe(12);
	});

	it('recognizes a rectangle', () => {
		const result = recognizeInkShape([
			p(0, 0), p(50, 1), p(100, 0), p(99, 50), p(100, 100),
			p(50, 99), p(0, 100), p(1, 50), p(0, 0),
		]);
		expect(result?.shape).toBe('rectangle');
		expect(result?.points).toHaveLength(5);
	});

	it('recognizes a circle and outputs equal radii', () => {
		const points: InkPoint[] = [];
		for (let i = 0; i <= 24; i++) {
			const angle = i / 24 * Math.PI * 2;
			points.push(p(50 + Math.cos(angle) * 38, 50 + Math.sin(angle) * 41));
		}
		const result = recognizeInkShape(points);
		expect(result?.shape).toBe('circle');
		const xs = result!.points.map((point) => point[0]);
		const ys = result!.points.map((point) => point[1]);
		expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.max(...ys) - Math.min(...ys));
	});

	it('does not convert an obvious ellipse into a circle', () => {
		const points: InkPoint[] = [];
		for (let i = 0; i <= 24; i++) {
			const angle = i / 24 * Math.PI * 2;
			points.push(p(50 + Math.cos(angle) * 45, 50 + Math.sin(angle) * 18));
		}
		expect(recognizeInkShape(points)).toBeNull();
	});
});
