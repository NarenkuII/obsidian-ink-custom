import type { InkStroke } from './types';

export interface StraightLineSelection {
	stroke: InkStroke;
	start: { x: number; y: number };
	middle: { x: number; y: number };
	end: { x: number; y: number };
}

/** Recognized lines are persisted as exactly two points. */
export function getStraightLineSelection(strokes: InkStroke[]): StraightLineSelection | null {
	if (strokes.length !== 1 || strokes[0].points.length !== 2) return null;
	const stroke = strokes[0];
	const start = {
		x: stroke.points[0][0] + stroke.offset.x,
		y: stroke.points[0][1] + stroke.offset.y,
	};
	const end = {
		x: stroke.points[1][0] + stroke.offset.x,
		y: stroke.points[1][1] + stroke.offset.y,
	};
	return {
		stroke,
		start,
		end,
		middle: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
	};
}
