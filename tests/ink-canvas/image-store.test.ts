import { ImageStore } from '../../src/ink-canvas/image-store';
import type { InkImage } from '../../src/ink-canvas/types';

const image: InkImage = {
	id: 'image-1',
	dataUrl: 'data:image/png;base64,AAAA',
	x: 0,
	y: 0,
	width: 100,
	height: 50,
	rotation: 0,
};

describe('ImageStore', () => {
	it('adds, transforms and removes images', () => {
		const store = new ImageStore();
		const listener = jest.fn();
		store.subscribe(listener);
		store.add(image);
		store.update({ ...image, x: 25, rotation: 30 });
		expect(store.getById(image.id)).toMatchObject({ x: 25, rotation: 30 });
		store.remove([image.id]);
		expect(store.getAll()).toEqual([]);
		expect(listener).toHaveBeenCalledTimes(3);
	});
});
