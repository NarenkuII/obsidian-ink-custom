/**
 * DOM hit-testing for committed ink strokes on the SVG canvas.
 * Uses rendered geometry so camera transforms and offsets stay correct.
 */

export function getStrokeIdAtClientPoint(
	svg: SVGSVGElement,
	clientX: number,
	clientY: number,
): string | null {
	return getStrokeIdsAtClientPoint(svg, clientX, clientY)[0] ?? null;
}

export function getStrokeIdsAtClientPoint(
	svg: SVGSVGElement,
	clientX: number,
	clientY: number,
): string[] {
	const document = svg.ownerDocument;
	if (!document) return [];

	const elementsAtPoint = document.elementsFromPoint?.(clientX, clientY) ?? [];
	const strokeIds = new Set<string>();
	for (const element of elementsAtPoint) {
		if (!(element.instanceOf(Element))) continue;
		const strokeElement = element.closest('[data-stroke-id]');
		if (!strokeElement || !svg.contains(strokeElement)) continue;
		const strokeId = strokeElement.getAttribute('data-stroke-id');
		if (strokeId) strokeIds.add(strokeId);
	}
	if (strokeIds.size > 0) return Array.from(strokeIds);

	const fallback = document.elementFromPoint(clientX, clientY);
	if (!fallback) return [];
	const strokeElement = fallback.closest('[data-stroke-id]');
	if (!strokeElement || !svg.contains(strokeElement)) return [];
	const strokeId = strokeElement.getAttribute('data-stroke-id');
	return strokeId ? [strokeId] : [];
}
