import type { InkPoint } from './types';

export type RecognizedShape = 'line' | 'rectangle' | 'ellipse' | 'triangle' | 'arrow';

export interface ShapeRecognitionResult {
	shape: RecognizedShape;
	points: InkPoint[];
}

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
	if (endpointDistance / pathLength >= 0.965) {
		return { shape: 'line', points: [withPressure(start, pressure), withPressure(end, pressure)] };
	}

	const simplifiedOpen = simplify(points, Math.max(2, diagonal * 0.045));
	const arrow = recognizeArrow(simplifiedOpen, pressure, diagonal);
	if (arrow) return arrow;

	const closed = endpointDistance <= Math.max(14, diagonal * 0.2);
	if (!closed) return null;
	const loop = points.slice(0, -1);
	const radialVariation = ellipseRadialVariation(loop, bounds);
	const aspect = bounds.width / Math.max(1, bounds.height);
	if (radialVariation < 0.2 && aspect > 0.45 && aspect < 2.2) {
		return { shape: 'ellipse', points: ellipsePoints(bounds, pressure) };
	}

	const polygon = simplify([...loop, loop[0]], Math.max(3, diagonal * 0.075));
	const corners = removeClosingDuplicate(polygon);
	if (corners.length === 3) {
		return { shape: 'triangle', points: closePolygon(corners, pressure) };
	}
	if (corners.length === 4 && isRectangle(corners)) {
		return { shape: 'rectangle', points: closePolygon(corners, pressure) };
	}
	return null;
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
		const shaftStart = points[0];
		return {
			shape: 'arrow',
			points: [shaftStart, tipA, wingA, tipA, wingB].map((point) => withPressure(point, pressure)),
		};
	}
	return null;
}

function ellipsePoints(bounds: ReturnType<typeof pointBounds>, pressure: number): InkPoint[] {
	const cx = bounds.minX + bounds.width / 2;
	const cy = bounds.minY + bounds.height / 2;
	const points: InkPoint[] = [];
	for (let i = 0; i <= 40; i++) {
		const angle = (i / 40) * Math.PI * 2;
		points.push([cx + Math.cos(angle) * bounds.width / 2, cy + Math.sin(angle) * bounds.height / 2, pressure]);
	}
	return points;
}

function ellipseRadialVariation(points: InkPoint[], bounds: ReturnType<typeof pointBounds>): number {
	const rx = Math.max(1, bounds.width / 2);
	const ry = Math.max(1, bounds.height / 2);
	const cx = bounds.minX + rx;
	const cy = bounds.minY + ry;
	const radii = points.map((point) => Math.hypot((point[0] - cx) / rx, (point[1] - cy) / ry));
	const mean = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
	return Math.sqrt(radii.reduce((sum, radius) => sum + (radius - mean) ** 2, 0) / radii.length);
}

function isRectangle(points: InkPoint[]): boolean {
	for (let i = 0; i < 4; i++) {
		const prev = points[(i + 3) % 4];
		const cur = points[i];
		const next = points[(i + 1) % 4];
		const ax = prev[0] - cur[0];
		const ay = prev[1] - cur[1];
		const bx = next[0] - cur[0];
		const by = next[1] - cur[1];
		const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
		if (denominator === 0 || Math.abs((ax * bx + ay * by) / denominator) > 0.38) return false;
	}
	return true;
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

function removeClosingDuplicate(points: InkPoint[]): InkPoint[] {
	if (points.length > 1 && distance(points[0], points[points.length - 1]) < 0.001) return points.slice(0, -1);
	return points;
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
