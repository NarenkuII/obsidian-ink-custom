import { describe, expect, test } from '@jest/globals';
import { ERASER_HIT_RADIUS_REFERENCE } from 'src/ink-canvas/constants/erase-tool';
import { getEraserClientSamplePoints } from 'src/ink-canvas/utils/eraser-hit-samples';

describe('eraser hit samples', () => {
	test('covers the center, middle, and edge of the eraser disk', () => {
		const samples = getEraserClientSamplePoints(100, 200, null, 1);
		const distances = samples.map(({ x, y }) => Math.hypot(x - 100, y - 200));

		expect(samples).toHaveLength(17);
		expect(distances).toContain(0);
		expect(distances.some((distance) => Math.abs(distance - ERASER_HIT_RADIUS_REFERENCE * 0.5) < 0.001)).toBe(true);
		expect(distances.some((distance) => Math.abs(distance - ERASER_HIT_RADIUS_REFERENCE) < 0.001)).toBe(true);
	});

	test('fills a fast drag with overlapping disk samples', () => {
		const samples = getEraserClientSamplePoints(20, 0, { x: 0, y: 0 }, 1);
		const centerLineSamples = samples.filter(({ y }) => Math.abs(y) < 0.001);

		expect(centerLineSamples.some(({ x }) => Math.abs(x - 8) < 0.001)).toBe(true);
		expect(centerLineSamples.some(({ x }) => Math.abs(x - 12) < 0.001)).toBe(true);
		expect(centerLineSamples.some(({ x }) => Math.abs(x - 20) < 0.001)).toBe(true);
	});
});
