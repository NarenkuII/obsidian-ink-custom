import { getStraightLineSelection } from '../../src/ink-canvas/line-selection';
import type { InkStroke } from '../../src/ink-canvas/types';
import { DEFAULT_STROKE_STYLE } from '../../src/ink-canvas/types';

function stroke(points: InkStroke['points']): InkStroke {
	return {
		id: 'line',
		points,
		style: { ...DEFAULT_STROKE_STYLE },
		offset: { x: 10, y: 20 },
	};
}

describe('getStraightLineSelection', () => {
	it('returns start, middle, and end handles for one recognized line', () => {
		const result = getStraightLineSelection([stroke([[0, 0, 0.5], [100, 20, 0.5]])]);
		expect(result?.start).toEqual({ x: 10, y: 20 });
		expect(result?.middle).toEqual({ x: 60, y: 30 });
		expect(result?.end).toEqual({ x: 110, y: 40 });
	});

	it('keeps the regular selection for freehand or multiple strokes', () => {
		const freehand = stroke([[0, 0, 0.5], [50, 10, 0.5], [100, 20, 0.5]]);
		expect(getStraightLineSelection([freehand])).toBeNull();
		expect(getStraightLineSelection([stroke([[0, 0, 0.5], [1, 1, 0.5]]), freehand])).toBeNull();
	});
});
