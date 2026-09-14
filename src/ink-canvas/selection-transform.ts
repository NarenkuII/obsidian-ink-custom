import type { InkStroke } from './types';

export interface PagePoint {
	x: number;
	y: number;
}

export interface PageTransform {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
	strokeScale: number;
}

export const IDENTITY_PAGE_TRANSFORM: PageTransform = {
	a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, strokeScale: 1,
};

export function translationTransform(dx: number, dy: number): PageTransform {
	return { ...IDENTITY_PAGE_TRANSFORM, e: dx, f: dy };
}

export function uniformScaleTransform(anchor: PagePoint, scale: number): PageTransform {
	return {
		a: scale,
		b: 0,
		c: 0,
		d: scale,
		e: anchor.x * (1 - scale),
		f: anchor.y * (1 - scale),
		strokeScale: Math.abs(scale),
	};
}

export function rotationTransform(center: PagePoint, radians: number): PageTransform {
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return {
		a: cos,
		b: sin,
		c: -sin,
		d: cos,
		e: center.x - cos * center.x + sin * center.y,
		f: center.y - sin * center.x - cos * center.y,
		strokeScale: 1,
	};
}

export function applyPageTransform(point: PagePoint, transform: PageTransform): PagePoint {
	return {
		x: transform.a * point.x + transform.c * point.y + transform.e,
		y: transform.b * point.x + transform.d * point.y + transform.f,
	};
}

export function transformStroke(stroke: InkStroke, transform: PageTransform): InkStroke {
	return {
		...stroke,
		points: stroke.points.map(([x, y, pressure]) => {
			const transformed = applyPageTransform(
				{ x: x + stroke.offset.x, y: y + stroke.offset.y },
				transform,
			);
			return [transformed.x, transformed.y, pressure];
		}),
		style: {
			...stroke.style,
			size: stroke.style.size * transform.strokeScale,
		},
		offset: { x: 0, y: 0 },
	};
}

export function svgMatrixForStroke(stroke: InkStroke, transform: PageTransform): string {
	const e = transform.a * stroke.offset.x + transform.c * stroke.offset.y + transform.e;
	const f = transform.b * stroke.offset.x + transform.d * stroke.offset.y + transform.f;
	return `matrix(${transform.a} ${transform.b} ${transform.c} ${transform.d} ${e} ${f})`;
}
