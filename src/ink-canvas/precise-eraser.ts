import type { InkPoint, InkStroke } from './types';

export interface EraserPoint {
	x: number;
	y: number;
}

let fragmentCounter = 0;

export function splitStrokeByEraserPath(
	stroke: InkStroke,
	eraserPath: EraserPoint[],
	eraserRadius: number,
): InkStroke[] {
	if (stroke.points.length === 0 || eraserPath.length === 0) return [stroke];

	const worldPoints = densifyPoints(
		stroke.points.map(([x, y, pressure]) => [x + stroke.offset.x, y + stroke.offset.y, pressure]),
		Math.max(0.75, eraserRadius * 0.45),
	);
	const effectiveRadius = eraserRadius + stroke.style.size * 0.35;
	const keptRuns: InkPoint[][] = [];
	let run: InkPoint[] = [];
	let removedAny = false;

	for (const point of worldPoints) {
		const erased = distanceToPolyline({ x: point[0], y: point[1] }, eraserPath) <= effectiveRadius;
		if (erased) {
			removedAny = true;
			if (run.length > 0) keptRuns.push(run);
			run = [];
		} else {
			run.push(point);
		}
	}
	if (run.length > 0) keptRuns.push(run);
	if (!removedAny) return [stroke];

	return keptRuns
		.filter((points) => points.length >= 2)
		.map((points) => ({
			...stroke,
			id: `${stroke.id}_fragment_${Date.now()}_${fragmentCounter++}`,
			points,
			offset: { x: 0, y: 0 },
		}));
}

function densifyPoints(points: InkPoint[], maxStep: number): InkPoint[] {
	if (points.length < 2) return points.map(copyPoint);
	const result: InkPoint[] = [copyPoint(points[0])];
	for (let i = 1; i < points.length; i++) {
		const from = points[i - 1];
		const to = points[i];
		const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
		const steps = Math.max(1, Math.ceil(distance / maxStep));
		for (let step = 1; step <= steps; step++) {
			const t = step / steps;
			result.push([
				from[0] + (to[0] - from[0]) * t,
				from[1] + (to[1] - from[1]) * t,
				from[2] + (to[2] - from[2]) * t,
			]);
		}
	}
	return result;
}

function distanceToPolyline(point: EraserPoint, path: EraserPoint[]): number {
	if (path.length === 1) return Math.hypot(point.x - path[0].x, point.y - path[0].y);
	let minimum = Infinity;
	for (let i = 1; i < path.length; i++) {
		minimum = Math.min(minimum, distanceToSegment(point, path[i - 1], path[i]));
	}
	return minimum;
}

function distanceToSegment(point: EraserPoint, from: EraserPoint, to: EraserPoint): number {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
	const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
	return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
}

function copyPoint(point: InkPoint): InkPoint {
	return [point[0], point[1], point[2]];
}
