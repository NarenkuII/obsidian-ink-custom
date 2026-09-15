import type { InkImage } from './types';

export type ImageStoreListener = () => void;

export class ImageStore {
	private images = new Map<string, InkImage>();
	private order: string[] = [];
	private listeners = new Set<ImageStoreListener>();

	subscribe(listener: ImageStoreListener): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	private notify(): void {
		this.listeners.forEach((listener) => listener());
	}

	add(image: InkImage): void {
		this.images.set(image.id, image);
		if (!this.order.includes(image.id)) this.order.push(image.id);
		this.notify();
	}

	addMany(images: InkImage[]): void {
		for (const image of images) {
			this.images.set(image.id, image);
			if (!this.order.includes(image.id)) this.order.push(image.id);
		}
		this.notify();
	}

	update(image: InkImage): void {
		if (!this.images.has(image.id)) return;
		this.images.set(image.id, image);
		this.notify();
	}

	remove(ids: string[]): void {
		const removed = new Set(ids);
		ids.forEach((id) => this.images.delete(id));
		this.order = this.order.filter((id) => !removed.has(id));
		this.notify();
	}

	getById(id: string): InkImage | undefined {
		return this.images.get(id);
	}

	getAll(): InkImage[] {
		return this.order.map((id) => this.images.get(id)).filter((image): image is InkImage => image !== undefined);
	}

	replaceAll(images: InkImage[]): void {
		this.images.clear();
		this.order = [];
		for (const image of images) {
			this.images.set(image.id, image);
			this.order.push(image.id);
		}
		this.notify();
	}
}
