import { describe, expect, test } from '@jest/globals';
import { buildInkStrokeStyleForTreatAs } from 'src/ink-canvas/stroke-presets';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';

describe('stroke presets', () => {
	test('applies configured pen size and stabilization at reference zoom', () => {
		const style = buildInkStrokeStyleForTreatAs(
			{ ...DEFAULT_STROKE_STYLE, size: 6 },
			'pen',
			1,
			0.35,
		);

		expect(style.size).toBe(6);
		expect(style.streamline).toBeCloseTo(0.35);
		expect(style.smoothing).toBeCloseTo(0.2);
	});

	test('clamps pen stabilization to the supported range', () => {
		const style = buildInkStrokeStyleForTreatAs(DEFAULT_STROKE_STYLE, 'pen', 1, 2);
		expect(style.streamline).toBeCloseTo(0.6);
	});
});
