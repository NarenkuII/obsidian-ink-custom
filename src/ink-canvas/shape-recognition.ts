import type { InkPoint } from './types';

export type RecognizedShape = 'line' | 'rectangle' | 'circle' | 'arrow';

export interface ShapeRecognitionResult {
	shape: RecognizedShape;
	points: InkPoint[];
}

const CLOSED_SAMPLE_COUNT = 64;
const RECTANGLE_TEMPLATE = makeRectangleTemplate(CLOSED_SAMPLE_COUNT);
const CIRCLE_TEMPLATE = makeCircleTemplate(CLOSED_SAMPLE_COUNT);

export function recognizeInkShape(points: InkPoint[]): ShapeRecognitionResult | null {
	if (points.length < 2) return null;
	const pathLength = polylineLength(points);
	const bounds = pointBounds(points);
	const diagonal = Math.hypot(bounds.width, bounds.height);
	if (pathLength < 20 || diagonal < 10) return null;

	const start = points[0];
	const end = points[points.length - 1];
	const endpointDistance = distance(start, end);
	const pressure = averagePressure(points);
	if (looksLikeLine(points, pathLength, diagonal)) {
		return { shape: 'line', points: snappedLinePoints(start, end, pressure) };
	}

	const simplifiedOpen = simplify(points, Math.max(2, diagonal * 0.045));
	const arrow = recognizeArrow(simplifiedOpen, pressure, diagonal);
	if (arrow) return arrow;

	const closed = endpointDistance <= Math.max(18, diagonal * 0.32);
	if (!closed) return null;
	const closedPath = [...points, copyPoint(start)];
	const samples = normalizeClosedGesture(resamplePolyline(closedPath, CLOSED_SAMPLE_COUNT));
	const rectangleScore = cyclicPathDistance(samples, RECTANGLE_TEMPLATE);
	const circleScore = cyclicPathDistance(samples, CIRCLE_TEMPLATE);
	const boundaryError = rectangleBoundaryError(samples);
	const sharpCorners = countSharpCornerClusters(samples);

	// $1-style normalized template matching is much less sensitive to drawing speed
	// and raw pointer density than corner counting on the original samples.
	if (
		rectangleScore <= 0.23
		&& (boundaryError <= 0.03 || (boundaryError <= 0.06 && sharpCorners >= 3 && sharpCorners <= 6))
	) {
		return { shape: 'rectangle', points: rectanglePoints(bounds, pressure) };
	}

	const aspect = bounds.width / Math.max(1, bounds.height);
	if (aspect >= 0.64 && aspect <= 1.56 && circleScore <= 0.17 && circleScore < rectangleScore) {
		return { shape: 'circle', points: circlePoints(bounds, pressure) };
	}
	return null;
}

function looksLikeLine(points: InkPoint[], pathLength: number, diagonal: number): boolean {
	const endpointProgress = distance(points[0], points[points.length - 1]) / pathLength;
	if (endpointProgress < 0.72) return false;

	const centroid = points.reduce(
		(sum, point) => ({ x: sum.x + point[0], y: sum.y + point[1] }),
		{ x: 0, y: 0 },
	);
	centroid.x /= points.length;
	centroid.y /= points.length;
	let xx = 0;
	let yy = 0;
	let xy = 0;
	for (const point of points) {
		const dx = point[0] - centroid.x;
		const dy = point[1] - centroid.y;
		xx += dx * dx;
		yy += dy * dy;
		xy += dx * dy;
	}
	const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
	const axis = { x: Math.cos(angle), y: Math.sin(angle) };
	const normal = { x: -axis.y, y: axis.x };
	const projections = points.map((point) => ({
		along: (point[0] - centroid.x) * axis.x + (point[1] - centroid.y) * axis.y,
		across: (point[0] - centroid.x) * normal.x + (point[1] - centroid.y) * normal.y,
	}));
	const rmsError = Math.sqrt(projections.reduce((sum, point) => sum + point.across ** 2, 0) / projections.length);
	let projectedTravel = 0;
	for (let i = 1; i < projections.length; i++) {
		projectedTravel += Math.abs(projections[i].along - projections[i - 1].along);
	}
	const projectedSpan = Math.max(...projections.map((point) => point.along))
		- Math.min(...projections.map((point) => point.along));
	return rmsError / diagonal <= 0.075 && projectedSpan / Math.max(1, projectedTravel) >= 0.7;
}

const AXIS_SNAP_RADIANS = 14 * Math.PI / 180;

function snappedLinePoints(start: InkPoint, end: InkPoint, pressure: number): InkPoint[] {
	const dx = end[0] - start[0];
	const dy = end[1] - start[1];
	const angle = Math.atan2(Math.abs(dy), Math.abs(dx));
	let snappedEnd: InkPoint = end;
	if (angle <= AXIS_SNAP_RADIANS) {
		snappedEnd = [end[0], start[1], end[2]];
	} else if (Math.abs(Math.PI / 2 - angle) <= AXIS_SNAP_RADIANS) {
		snappedEnd = [start[0], end[1], end[2]];
	}
	return [withPressure(start, pressure), withPressure(snappedEnd, pressure)];
}

function recognizeArrow(points: InkPoint[], pressure: number, diagonal: number): ShapeRecognitionResult | null {
	if (points.length < 5 || points.length > 7) return null;
	for (let i = 1; i <= points.length - 4; i++) {
		const tipA = points[i];
		const wingA = points[i + 1];
		const tipB = points[i + 2];
		const wingB = points[i + 3];
		if (distance(tipA, tipB) > diagonal * 0.14) continue;
		const headSizeA = distance(tipA, wingA);
		const headSizeB = distance(tipB, wingB);
		if (headSizeA < diagonal * 0.08 || headSizeB < diagonal * 0.08) continue;
		return {
			shape: 'arrow',
			points: [points[0], tipA, wingA, tipA, wingB].map((point) => withPressure(point, pressure)),
		};
	}
	return null;
}

function rectanglePoints(bounds: ReturnType<typeof pointBounds>, pressure: number): InkPoint[] {
	const corners: InkPoint[] = [
		[bounds.minX, bounds.minY, pressure],
		[bounds.maxX, bounds.minY, pressure],
		[bounds.maxX, bounds.maxY, pressure],
		[bounds.minX, bounds.maxY, pressure],
	];
	const result: InkPoint[] = [];
	const samplesPerSide = 12;
	for (let side = 0; side < corners.length; side++) {
		const from = corners[side];
		const to = corners[(side + 1) % corners.length];
		for (let i = 0; i < samplesPerSide; i++) {
			const t = i / samplesPerSide;
			result.push([
				from[0] + (to[0] - from[0]) * t,
				from[1] + (to[1] - from[1]) * t,
				pressure,
			]);
		}
	}
	result.push(copyPoint(result[0]));
	return result;
}

function circlePoints(bounds: ReturnType<typeof pointBounds>, pressure: number): InkPoint[] {
	const cx = bounds.minX + bounds.width / 2;
	const cy = bounds.minY + bounds.height / 2;
	const radius = (bounds.width + bounds.height) / 4;
	const result: InkPoint[] = [];
	for (let i = 0; i <= 40; i++) {
		const angle = (i / 40) * Math.PI * 2;
		result.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, pressure]);
	}
	return result;
}

/** Equal-distance resampling, following the normalization stage of the $1 recognizer. */
function resamplePolyline(points: InkPoint[], count: number): InkPoint[] {
	const totalLength = polylineLength(points);
	if (totalLength === 0 || count <= 1) return [copyPoint(points[0])];
	const interval = totalLength / (count - 1);
	const result: InkPoint[] = [copyPoint(points[0])];
	let distanceSinceSample = 0;
	let previous = copyPoint(points[0]);
	for (let i = 1; i < points.length && result.length < count; i++) {
		const current = copyPoint(points[i]);
		let segmentLength = distance(previous, current);
		while (segmentLength > 0 && distanceSinceSample + segmentLength >= interval && result.length < count) {
			const ratio = (interval - distanceSinceSample) / segmentLength;
			const sample: InkPoint = [
				previous[0] + (current[0] - previous[0]) * ratio,
				previous[1] + (current[1] - previous[1]) * ratio,
				previous[2] + (current[2] - previous[2]) * ratio,
			];
			result.push(sample);
			previous = sample;
			segmentLength = distance(previous, current);
			distanceSinceSample = 0;
		}
		distanceSinceSample += segmentLength;
		previous = current;
	}
	while (result.length < count) result.push(copyPoint(points[points.length - 1]));
	return result;
}

function normalizeClosedGesture(points: InkPoint[]): InkPoint[] {
	const bounds = pointBounds(points);
	return points.map((point) => [
		(point[0] - bounds.minX) / Math.max(1, bounds.width),
		(point[1] - bounds.minY) / Math.max(1, bounds.height),
		point[2],
	]);
}

function cyclicPathDistance(candidate: InkPoint[], template: InkPoint[]): number {
	let best = Infinity;
	const count = Math.min(candidate.length, template.length);
	for (const direction of [1, -1]) {
		for (let shift = 0; shift < count; shift++) {
			let total = 0;
			for (let i = 0; i < count; i++) {
				const candidateIndex = (shift + direction * i + count * 2) % count;
				total += distance(candidate[candidateIndex], template[i]);
			}
			best = Math.min(best, total / count);
		}
	}
	return best;
}

function rectangleBoundaryError(points: InkPoint[]): number {
	return points.reduce((sum, point) => {
		const distanceToBoundary = Math.min(point[0], 1 - point[0], point[1], 1 - point[1]);
		return sum + Math.max(0, distanceToBoundary);
	}, 0) / points.length;
}

function countSharpCornerClusters(points: InkPoint[]): number {
	const count = points.length;
	const window = 3;
	const candidates: boolean[] = [];
	for (let i = 0; i < count; i++) {
		const before = points[(i - window + count) % count];
		const current = points[i];
		const after = points[(i + window) % count];
		const ax = current[0] - before[0];
		const ay = current[1] - before[1];
		const bx = after[0] - current[0];
		const by = after[1] - current[1];
		const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
		const cosine = denominator === 0 ? 1 : Math.max(-1, Math.min(1, (ax * bx + ay * by) / denominator));
		candidates.push(Math.acos(cosine) >= 42 * Math.PI / 180);
	}
	let clusters = 0;
	for (let i = 0; i < count; i++) {
		if (candidates[i] && !candidates[(i - 1 + count) % count]) clusters++;
	}
	return clusters;
}

function makeRectangleTemplate(count: number): InkPoint[] {
	const result: InkPoint[] = [];
	for (let i = 0; i < count; i++) {
		const t = i / count * 4;
		if (t < 1) result.push([t, 0, 0.5]);
		else if (t < 2) result.push([1, t - 1, 0.5]);
		else if (t < 3) result.push([3 - t, 1, 0.5]);
		else result.push([0, 4 - t, 0.5]);
	}
	return result;
}

function makeCircleTemplate(count: number): InkPoint[] {
	const result: InkPoint[] = [];
	for (let i = 0; i < count; i++) {
		const angle = i / count * Math.PI * 2 - Math.PI / 2;
		result.push([0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5, 0.5]);
	}
	return result;
}

function simplify(points: InkPoint[], epsilon: number): InkPoint[] {
	if (points.length <= 2) return points;
	let maxDistance = 0;
	let index = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const currentDistance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
		if (currentDistance > maxDistance) {
			maxDistance = currentDistance;
			index = i;
		}
	}
	if (maxDistance <= epsilon) return [points[0], points[points.length - 1]];
	const left = simplify(points.slice(0, index + 1), epsilon);
	const right = simplify(points.slice(index), epsilon);
	return [...left.slice(0, -1), ...right];
}

function perpendicularDistance(point: InkPoint, from: InkPoint, to: InkPoint): number {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	if (dx === 0 && dy === 0) return distance(point, from);
	return Math.abs(dy * point[0] - dx * point[1] + to[0] * from[1] - to[1] * from[0]) / Math.hypot(dx, dy);
}

function pointBounds(points: InkPoint[]) {
	const xs = points.map((point) => point[0]);
	const ys = points.map((point) => point[1]);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const maxX = Math.max(...xs);
	const maxY = Math.max(...ys);
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function closePolygon(points: InkPoint[], pressure: number): InkPoint[] {
	return [...points, points[0]].map((point) => withPressure(point, pressure));
}

function polylineLength(points: InkPoint[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
	return total;
}

function distance(a: InkPoint, b: InkPoint): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function averagePressure(points: InkPoint[]): number {
	return points.reduce((sum, point) => sum + point[2], 0) / points.length;
}

function withPressure(point: InkPoint, pressure: number): InkPoint {
	return [point[0], point[1], pressure];
}

function copyPoint(point: InkPoint): InkPoint {
	return [point[0], point[1], point[2]];
}
