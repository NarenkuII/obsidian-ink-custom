import './drawing-menu.scss';
import '../writing-menu/writing-menu.scss';
import * as React from 'react';
import { SelectIcon } from 'src/graphics/icons/select-icon';
import { EraseIcon } from 'src/graphics/icons/erase-icon';
import { DrawIcon } from 'src/graphics/icons/draw-icon';
import { ExpandIcon } from 'src/graphics/icons/expand-icon';
import { PointerIcon } from 'src/graphics/icons/pointer-icon';
import { LockIcon } from 'src/graphics/icons/lock-icon';
import { ResizeDiagonalIcon } from 'src/graphics/icons/resize-diagonal-icon';
import classNames from 'classnames';
import { TooltipButton } from 'src/components/jsx-components/tooltip-button/tooltip-button';
import type { InkCanvasEditor, InkTool } from 'src/ink-canvas/types';
import { Notice } from 'obsidian';

//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

const STROKE_COLOURS = [
	{ label: 'Black or white (theme)', value: 'currentColor', swatch: 'var(--text-normal)' },
	{ label: 'Blue', value: '#2563eb', swatch: '#2563eb' },
	{ label: 'Red', value: '#dc2626', swatch: '#dc2626' },
	{ label: 'Green', value: '#16a34a', swatch: '#16a34a' },
] as const;

function inkToolToMenuTool(inkTool: InkTool): tool {
	if (inkTool === 'select') return tool.select;
	if (inkTool === 'erase') return tool.eraser;
	return tool.draw;
}

interface InkCanvasDrawingMenuProps {
	getEditor: () => InkCanvasEditor | undefined;
	onStoreChange: () => void;
	onActivateTool?: (tool: 'draw' | 'erase' | 'select') => void;
	onExpandClick?: () => void;
	showFingerDrawingToggle?: boolean;
	isFingerDrawingActive?: boolean;
	onFingerDrawingToggle?: () => void;
	embedId?: string;
	workspaceLeafId?: string;
	plugin?: import('src/main').default;
}

export const InkCanvasDrawingMenu = React.forwardRef<HTMLDivElement, InkCanvasDrawingMenuProps>((props, ref) => {
	const imageInputRef = React.useRef<HTMLInputElement>(null);

	const [curTool, setCurTool] = React.useState<tool>(tool.draw);
	const [curColour, setCurColour] = React.useState<string>('currentColor');
	const [wholeStrokeEraser, setWholeStrokeEraser] = React.useState(
		props.plugin?.settings.wholeStrokeEraser ?? true,
	);
	const [shapeRecognition, setShapeRecognition] = React.useState(
		props.plugin?.settings.shapeRecognitionEnabled ?? true,
	);
	const [selectionAspectRatioLocked, setSelectionAspectRatioLocked] = React.useState(true);

	// Sync toolbar highlight when the canvas changes tool (e.g. cmd/ctrl temporary erase).
	React.useEffect(() => {
		let unsubscribe: (() => void) | undefined;
		let pollId: number | undefined;

		const trySubscribe = (): boolean => {
			const editor = props.getEditor();
			if (!editor?.subscribeToolChange) return false;
			editor.setStrokeStyle({ color: 'currentColor' });
			setWholeStrokeEraser(editor.isWholeStrokeEraserEnabled());
			setShapeRecognition(editor.isShapeRecognitionEnabled());
			setSelectionAspectRatioLocked(editor.isSelectionAspectRatioLocked());
			unsubscribe = editor.subscribeToolChange((inkTool) => {
				setCurTool(inkToolToMenuTool(inkTool));
			});
			return true;
		};

		if (!trySubscribe()) {
			pollId = window.setInterval(() => {
				if (trySubscribe() && pollId !== undefined) {
					window.clearInterval(pollId);
					pollId = undefined;
				}
			}, 100);
		}

		return () => {
			if (pollId !== undefined) window.clearInterval(pollId);
			unsubscribe?.();
		};
	}, [props.getEditor]);

	///////////

	function activateSelectTool() {
		const editor = props.getEditor();
		if (!editor) return;
		editor.setTool('select');
		setCurTool(tool.select);
		props.onActivateTool?.('select');
	}

	function activateDrawTool() {
		const editor = props.getEditor();
		if (!editor) return;
		editor.setTool('draw');
		setCurTool(tool.draw);
		props.onActivateTool?.('draw');
	}

	function activateEraseTool() {
		const editor = props.getEditor();
		if (!editor) return;
		editor.setTool('erase');
		setCurTool(tool.eraser);
		props.onActivateTool?.('erase');
	}

	function activateStrokeColour(colour: string) {
		const editor = props.getEditor();
		if (!editor) return;
		if (curTool === tool.select && editor.setSelectedStrokeStyle({ color: colour })) {
			setCurColour(colour);
			return;
		}
		editor.setStrokeStyle({ color: colour });
		editor.setTool('draw');
		setCurColour(colour);
		setCurTool(tool.draw);
		props.onActivateTool?.('draw');
	}

	function toggleSelectionAspectRatio() {
		const next = !selectionAspectRatioLocked;
		setSelectionAspectRatioLocked(next);
		props.getEditor()?.setSelectionAspectRatioLocked(next);
	}

	function toggleEraserMode() {
		const next = !wholeStrokeEraser;
		setWholeStrokeEraser(next);
		props.getEditor()?.setWholeStrokeEraserEnabled(next);
		if (props.plugin) {
			props.plugin.settings.wholeStrokeEraser = next;
			void props.plugin.saveSettings();
		}
	}

	function toggleShapeRecognition() {
		const next = !shapeRecognition;
		setShapeRecognition(next);
		props.getEditor()?.setShapeRecognitionEnabled(next);
		if (props.plugin) {
			props.plugin.settings.shapeRecognitionEnabled = next;
			void props.plugin.saveSettings();
		}
	}

	async function importImage(file: File | undefined) {
		if (!file) return;
		const editor = props.getEditor();
		if (!editor) return;
		try {
			const optimized = await optimizeImportedImage(file);
			editor.addImage(optimized.dataUrl, optimized.width, optimized.height);
			props.onStoreChange();
		} catch (error) {
			console.error('Ink: failed to import image', error);
			new Notice('Ink could not import this image format.');
		} finally {
			if (imageInputRef.current) imageInputRef.current.value = '';
		}
	}

	///////////
	///////////

	return <>
		<div
			ref={ref}
			className={classNames([
				'ink_menu-bar',
				'ink_menu-bar_full',
				'ink_menu-bar_canvas',
			])}
		>
			<div className='ink_quick-menu'>
				<input
					ref={imageInputRef}
					type='file'
					accept='image/*'
					className='ink_image-input'
					onChange={(event) => void importImage(event.currentTarget.files?.[0])}
				/>
				<TooltipButton tooltip='Import image' onClick={() => imageInputRef.current?.click()}>
					<span className='ink_tool-symbol' aria-hidden='true'>▧</span>
				</TooltipButton>
				{curTool === tool.select && (
					<TooltipButton
						tooltip={selectionAspectRatioLocked ? 'Keep selection proportions' : 'Free selection scaling'}
						className={selectionAspectRatioLocked ? 'ink_menu-toggle--active' : undefined}
						onClick={toggleSelectionAspectRatio}
					>
						{selectionAspectRatioLocked ? <LockIcon /> : <ResizeDiagonalIcon />}
					</TooltipButton>
				)}
				{curTool === tool.eraser && (
					<TooltipButton
						tooltip={wholeStrokeEraser ? 'Whole-stroke eraser' : 'Precise eraser'}
						className={wholeStrokeEraser ? 'ink_menu-toggle--active' : undefined}
						onClick={toggleEraserMode}
					>
						<span className='ink_tool-symbol' aria-hidden='true'>{wholeStrokeEraser ? '■' : '⌁'}</span>
					</TooltipButton>
				)}
				{curTool === tool.draw && (
					<TooltipButton
						tooltip={shapeRecognition ? 'Shape recognition enabled' : 'Shape recognition disabled'}
						className={shapeRecognition ? 'ink_menu-toggle--active' : undefined}
						onClick={toggleShapeRecognition}
					>
						<span className='ink_tool-symbol' aria-hidden='true'>□</span>
					</TooltipButton>
				)}
			{(props.showFingerDrawingToggle || props.onExpandClick) && (<>
					{props.onExpandClick && (
						<TooltipButton
							tooltip='Open in full view'
							onClick={() => props.onExpandClick?.()}
						>
							<ExpandIcon />
						</TooltipButton>
					)}
					{props.showFingerDrawingToggle && (
						<TooltipButton
							tooltip={props.isFingerDrawingActive ? 'Enable drawing with finger' : 'Disable drawing with finger'}
							className={props.isFingerDrawingActive ? 'ink_menu-toggle--active' : undefined}
							onClick={() => props.onFingerDrawingToggle?.()}
						>
							<PointerIcon />
						</TooltipButton>
					)}
				</>)}
			</div>
			<div className='ink_tool-menu'>
				<TooltipButton
					tooltip='Select'
					onClick={activateSelectTool}
					disabled={curTool === tool.select}
				>
					<SelectIcon />
				</TooltipButton>
				<TooltipButton
					tooltip='Draw'
					onClick={activateDrawTool}
					disabled={curTool === tool.draw}
				>
					<DrawIcon />
				</TooltipButton>
				<TooltipButton
					tooltip='Erase'
					onClick={activateEraseTool}
					disabled={curTool === tool.eraser}
				>
					<EraseIcon />
				</TooltipButton>
			</div>
			<div className='ink_other-menu ink_colour-menu'>
				{STROKE_COLOURS.map((colour) => (
					<TooltipButton
						key={colour.value}
						tooltip={colour.label}
						className={classNames([
							'ink_colour-button',
							curColour === colour.value && 'ink_colour-button--active',
						])}
						onClick={() => activateStrokeColour(colour.value)}
					>
						<span
							className='ink_colour-swatch'
							style={{ backgroundColor: colour.swatch }}
						/>
					</TooltipButton>
				))}
			</div>
		</div>
	</>;
});

export default InkCanvasDrawingMenu;

async function optimizeImportedImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
	const originalDataUrl = await readFileAsDataUrl(file);
	const image = await loadImage(originalDataUrl);
	const maxDimension = 2048;
	const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
	const width = Math.max(1, Math.round(image.naturalWidth * scale));
	const height = Math.max(1, Math.round(image.naturalHeight * scale));
	if (scale === 1 && file.size <= 2_500_000 && /image\/(png|jpeg|webp)/.test(file.type)) {
		return { dataUrl: originalDataUrl, width, height };
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) return { dataUrl: originalDataUrl, width, height };
	context.drawImage(image, 0, 0, width, height);
	return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), width, height };
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
		reader.readAsDataURL(file);
	});
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Unsupported image format'));
		image.src = dataUrl;
	});
}
