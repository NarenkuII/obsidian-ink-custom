import './drawing-menu.scss';
import '../writing-menu/writing-menu.scss';
import * as React from 'react';
import { SelectIcon } from 'src/graphics/icons/select-icon';
import { EraseIcon } from 'src/graphics/icons/erase-icon';
import { DrawIcon } from 'src/graphics/icons/draw-icon';
import { ExpandIcon } from 'src/graphics/icons/expand-icon';
import { PointerIcon } from 'src/graphics/icons/pointer-icon';
import classNames from 'classnames';
import { TooltipButton } from 'src/components/jsx-components/tooltip-button/tooltip-button';
import type { InkCanvasEditor, InkTool } from 'src/ink-canvas/types';
import { fetchLocally, saveLocally } from 'src/logic/utils/storage';

//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

const ACTIVE_STROKE_COLOUR_STORAGE_KEY = 'activeStrokeColour';
const STROKE_COLOURS = [
	{ label: 'Black', value: 'currentColor', swatch: '#111827' },
	{ label: 'Blue', value: '#2563eb', swatch: '#2563eb' },
	{ label: 'Red', value: '#dc2626', swatch: '#dc2626' },
	{ label: 'Green', value: '#16a34a', swatch: '#16a34a' },
] as const;

function getSavedStrokeColour(): string {
	const saved = fetchLocally(ACTIVE_STROKE_COLOUR_STORAGE_KEY);
	if (typeof saved !== 'string') return STROKE_COLOURS[0].value;
	return STROKE_COLOURS.some((colour) => colour.value === saved)
		? saved
		: STROKE_COLOURS[0].value;
}

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

	const [curTool, setCurTool] = React.useState<tool>(tool.draw);
	const [curColour, setCurColour] = React.useState<string>(() => getSavedStrokeColour());

	// Sync toolbar highlight when the canvas changes tool (e.g. cmd/ctrl temporary erase).
	React.useEffect(() => {
		let unsubscribe: (() => void) | undefined;
		let pollId: number | undefined;

		const trySubscribe = (): boolean => {
			const editor = props.getEditor();
			if (!editor?.subscribeToolChange) return false;
			editor.setStrokeStyle({ color: getSavedStrokeColour() });
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
		editor.setStrokeStyle({ color: colour });
		editor.setTool('draw');
		saveLocally(ACTIVE_STROKE_COLOUR_STORAGE_KEY, colour);
		setCurColour(colour);
		setCurTool(tool.draw);
		props.onActivateTool?.('draw');
	}

	///////////
	///////////

	return <>
		<div
			ref={ref}
			className={classNames([
				'ink_menu-bar',
				'ink_menu-bar_full',
			])}
		>
			{(props.showFingerDrawingToggle || props.onExpandClick) && (
				<div className='ink_quick-menu'>
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
				</div>
			)}
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
