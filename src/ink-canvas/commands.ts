import type { StrokeStore } from './stroke-store';
import type { InkStroke } from './types';
import type { InkImage } from './types';
import type { ImageStore } from './image-store';

///////////////////////////
///////////////////////////

/** Base interface for all undo/redo commands. */
export interface InkCommand {
	apply(): void;
	unapply(): void;
}

/** Add a single stroke to the store. */
export class AddStrokeCommand implements InkCommand {
	private store: StrokeStore;
	private stroke: InkStroke;

	constructor(store: StrokeStore, stroke: InkStroke) {
		this.store = store;
		this.stroke = stroke;
	}

	apply(): void {
		this.store.add(this.stroke);
	}

	unapply(): void {
		this.store.remove([this.stroke.id]);
	}
}

/** Remove one or more strokes from the store. */
export class RemoveStrokesCommand implements InkCommand {
	private store: StrokeStore;
	private removedStrokes: InkStroke[];

	constructor(store: StrokeStore, strokeIds: string[]) {
		this.store = store;
		// Capture the full stroke data at construction time so we can restore on unapply
		this.removedStrokes = strokeIds
			.map(id => store.getById(id))
			.filter((s): s is InkStroke => s !== undefined);
	}

	apply(): void {
		const ids = this.removedStrokes.map(s => s.id);
		this.store.remove(ids);
	}

	unapply(): void {
		this.store.addMany(this.removedStrokes);
	}
}

/** Move one or more strokes by updating their offsets. */
export class MoveStrokesCommand implements InkCommand {
	private store: StrokeStore;
	private strokeIds: string[];
	private previousOffsets: Map<string, { x: number; y: number }>;
	private newOffsets: Map<string, { x: number; y: number }>;

	constructor(
		store: StrokeStore,
		strokeIds: string[],
		deltaX: number,
		deltaY: number,
	) {
		this.store = store;
		this.strokeIds = strokeIds;

		// Capture previous offsets and compute new ones
		this.previousOffsets = new Map();
		this.newOffsets = new Map();
		for (const id of strokeIds) {
			const stroke = store.getById(id);
			if (!stroke) continue;
			this.previousOffsets.set(id, { ...stroke.offset });
			this.newOffsets.set(id, {
				x: stroke.offset.x + deltaX,
				y: stroke.offset.y + deltaY,
			});
		}
	}

	apply(): void {
		this.store.updateOffsets(this.newOffsets);
	}

	unapply(): void {
		this.store.updateOffsets(this.previousOffsets);
	}
}

/** Add several strokes as one undoable operation (paste, duplicate, precise erase fragments). */
export class AddStrokesCommand implements InkCommand {
	constructor(private store: StrokeStore, private strokes: InkStroke[]) {}

	apply(): void {
		this.store.addMany(this.strokes);
	}

	unapply(): void {
		this.store.remove(this.strokes.map((stroke) => stroke.id));
	}
}

/** Replace complete strokes with zero or more fragments as one undoable operation. */
export class ReplaceStrokesCommand implements InkCommand {
	constructor(
		private store: StrokeStore,
		private originals: InkStroke[],
		private replacements: InkStroke[],
	) {}

	apply(): void {
		this.store.remove(this.originals.map((stroke) => stroke.id));
		this.store.addMany(this.replacements);
	}

	unapply(): void {
		this.store.remove(this.replacements.map((stroke) => stroke.id));
		this.store.addMany(this.originals);
	}
}

/** Replace transformed strokes as one undoable selection operation. */
export class TransformStrokesCommand implements InkCommand {
	private store: StrokeStore;
	private previousStrokes: InkStroke[];
	private transformedStrokes: InkStroke[];

	constructor(store: StrokeStore, previousStrokes: InkStroke[], transformedStrokes: InkStroke[]) {
		this.store = store;
		this.previousStrokes = previousStrokes;
		this.transformedStrokes = transformedStrokes;
	}

	apply(): void {
		this.store.updateStrokes(this.transformedStrokes);
	}

	unapply(): void {
		this.store.updateStrokes(this.previousStrokes);
	}
}

/** Erase all strokes (used by the "erase all" menu action). */
export class EraseAllCommand implements InkCommand {
	private store: StrokeStore;
	private previousStrokes: InkStroke[];

	constructor(store: StrokeStore) {
		this.store = store;
		this.previousStrokes = store.getAll();
	}

	apply(): void {
		this.store.clear();
	}

	unapply(): void {
		this.store.replaceAll(this.previousStrokes);
	}
}

export class AddImagesCommand implements InkCommand {
	constructor(private store: ImageStore, private images: InkImage[]) {}
	apply(): void { this.store.addMany(this.images); }
	unapply(): void { this.store.remove(this.images.map((image) => image.id)); }
}

export class RemoveImagesCommand implements InkCommand {
	private images: InkImage[];
	constructor(private store: ImageStore, ids: string[]) {
		this.images = ids.map((id) => store.getById(id)).filter((image): image is InkImage => image !== undefined);
	}
	apply(): void { this.store.remove(this.images.map((image) => image.id)); }
	unapply(): void { this.store.addMany(this.images); }
}

export class TransformImageCommand implements InkCommand {
	constructor(private store: ImageStore, private before: InkImage, private after: InkImage) {}
	apply(): void { this.store.update(this.after); }
	unapply(): void { this.store.update(this.before); }
}
