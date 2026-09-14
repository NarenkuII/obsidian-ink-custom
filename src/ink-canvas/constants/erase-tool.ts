/**
 * Ink canvas eraser hit-testing tuning at reference zoom 1×.
 * Actual screen pixels are computed via {@link eraserHitRadiusScreenPx} /
 * {@link eraserSweepSpacingScreenPx} in `stroke-zoom-scale.ts`.
 */

/** Match the tighter hit margin used by the legacy tldraw eraser. */
export const ERASER_HIT_RADIUS_REFERENCE = 9;

/** Number of points on the ring at the scaled hit radius. */
export const ERASER_RING_SAMPLE_COUNT = 8;

/** Probe both the middle and edge of the eraser disk so tiny dots cannot sit between samples. */
export const ERASER_RING_RADIUS_FACTORS = [0.5, 1] as const;

/** Sweep sample spacing at 1× zoom along the drag path; scaled for camera zoom. */
export const ERASER_SWEEP_SAMPLE_SPACING_REFERENCE = 4;

/** Briefly retain the gray preview so quick taps receive visible feedback. */
export const ERASER_COMMIT_PREVIEW_MS = 50;

/** CSS class on stroke groups while the eraser marks them for removal. */
export const INK_STROKE_PENDING_ERASE_CLASS = 'ink-stroke--pending-erase';
