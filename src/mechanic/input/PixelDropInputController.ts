import type { LevelState } from '../engine/types.ts';
import type { PixelDropView } from '../render/PixelDropView.ts';

export interface PixelDropInputCallbacks {
  readonly getState: () => LevelState;
  readonly onSelectPiece: (pieceId: string) => void;
  readonly onClearSelection: () => void;
  readonly onPlacePiece: (pieceId: string, row: number, col: number) => boolean;
  readonly onRestart: () => void;
}

interface DragState {
  readonly pieceId: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly offsetRow: number;
  readonly offsetCol: number;
  moved: boolean;
  preview: HTMLElement | null;
}

const DRAG_THRESHOLD_PX = 5;

export class PixelDropInputController {
  readonly #view: PixelDropView;
  readonly #callbacks: PixelDropInputCallbacks;
  #drag: DragState | null = null;
  #suppressClick = false;
  #clickReleaseTimer: number | null = null;
  #attached = false;

  constructor(view: PixelDropView, callbacks: PixelDropInputCallbacks) {
    this.#view = view;
    this.#callbacks = callbacks;
  }

  attach(): void {
    if (this.#attached) return;
    this.#attached = true;
    this.#view.element.addEventListener('click', this.#onClick);
    this.#view.element.addEventListener('pointerdown', this.#onPointerDown);
    window.addEventListener('pointermove', this.#onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.#onPointerUp);
    window.addEventListener('pointercancel', this.#onPointerCancel);
  }

  destroy(): void {
    if (!this.#attached) return;
    this.#attached = false;
    this.#view.element.removeEventListener('click', this.#onClick);
    this.#view.element.removeEventListener('pointerdown', this.#onPointerDown);
    window.removeEventListener('pointermove', this.#onPointerMove);
    window.removeEventListener('pointerup', this.#onPointerUp);
    window.removeEventListener('pointercancel', this.#onPointerCancel);
    if (this.#clickReleaseTimer !== null) window.clearTimeout(this.#clickReleaseTimer);
    this.#clickReleaseTimer = null;
    this.#drag?.preview?.remove();
    this.#drag = null;
    this.#view.setDraggedPiece(null);
    this.#suppressClick = false;
  }

  readonly #onClick = (event: MouseEvent): void => {
    if (this.#suppressClick) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('[data-action="restart"]') !== null) {
      this.#callbacks.onRestart();
      return;
    }

    const slot = target.closest<HTMLButtonElement>('.pixel-drop-tray-slot');
    if (slot !== null) {
      const pieceId = slot.dataset['pieceId'];
      if (pieceId === undefined || slot.classList.contains('used')) return;
      this.#callbacks.onSelectPiece(pieceId);
      return;
    }

    const cell = target.closest<HTMLButtonElement>('.pixel-drop-board-cell');
    if (cell !== null) {
      this.#handleBoardClick(cell);
      return;
    }

    this.#callbacks.onClearSelection();
  };

  #handleBoardClick(cell: HTMLButtonElement): void {
    const state = this.#callbacks.getState();
    const row = Number(cell.dataset['row']);
    const col = Number(cell.dataset['col']);
    if (state.selectedPieceId !== null) {
      if (!this.#callbacks.onPlacePiece(state.selectedPieceId, row, col)) this.#view.flashInvalid(cell);
      return;
    }

    const pieceId = cell.dataset['pieceId'];
    if (pieceId !== undefined) this.#callbacks.onSelectPiece(pieceId);
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return;
    const state = this.#callbacks.getState();
    if (state.gameState === 'won') return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const slot = target.closest<HTMLButtonElement>('.pixel-drop-tray-slot:not(.used)');
    const boardCell = target.closest<HTMLButtonElement>('.pixel-drop-board-cell.occupied');
    const pieceId = slot?.dataset['pieceId'] ?? boardCell?.dataset['pieceId'];
    if (pieceId === undefined) return;

    let offsetRow = Number(target.closest<HTMLElement>('.pixel-drop-pixel')?.dataset['dr'] ?? 0);
    let offsetCol = Number(target.closest<HTMLElement>('.pixel-drop-pixel')?.dataset['dc'] ?? 0);
    if (boardCell !== null) {
      const placement = state.placements.find((item) => item.pieceId === pieceId);
      if (placement !== undefined) {
        offsetRow = Number(boardCell.dataset['row']) - placement.row;
        offsetCol = Number(boardCell.dataset['col']) - placement.col;
      }
    }

    this.#drag = {
      pieceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetRow,
      offsetCol,
      moved: false,
      preview: null,
    };
    event.preventDefault();
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < DRAG_THRESHOLD_PX) return;

    if (!drag.moved) {
      drag.moved = true;
      this.#suppressClick = true;
      drag.preview = this.#view.createDragPreview(drag.pieceId);
      this.#view.setDraggedPiece(drag.pieceId);
    }

    this.#positionPreview(event.clientX, event.clientY);
    event.preventDefault();
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (drag === null || drag.pointerId !== event.pointerId) return;

    if (drag.moved) {
      const cell = this.#view.getBoardCellAtPoint(event.clientX, event.clientY);
      if (cell !== null) {
        const row = Number(cell.dataset['row']) - drag.offsetRow;
        const col = Number(cell.dataset['col']) - drag.offsetCol;
        if (!this.#callbacks.onPlacePiece(drag.pieceId, row, col)) this.#view.flashInvalid(cell);
      }
    }

    this.#finishDrag();
  };

  readonly #onPointerCancel = (event: PointerEvent): void => {
    if (this.#drag?.pointerId !== event.pointerId) return;
    this.#finishDrag();
  };

  #positionPreview(clientX: number, clientY: number): void {
    const drag = this.#drag;
    if (drag?.preview === null || drag?.preview === undefined) return;
    const cellSize = this.#view.getBoardCellSize();
    drag.preview.style.left = String(clientX - (drag.offsetCol + 0.5) * cellSize) + 'px';
    drag.preview.style.top = String(clientY - (drag.offsetRow + 0.5) * cellSize) + 'px';
  }

  #finishDrag(): void {
    this.#drag?.preview?.remove();
    this.#drag = null;
    this.#view.setDraggedPiece(null);
    if (this.#clickReleaseTimer !== null) window.clearTimeout(this.#clickReleaseTimer);
    this.#clickReleaseTimer = window.setTimeout(() => {
      this.#suppressClick = false;
      this.#clickReleaseTimer = null;
    }, 0);
  }
}
