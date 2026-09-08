import { pixelDropEngine } from '../engine/pixelDropEngine.ts';
import { GRID_SIZE, type ColorId, type LevelConfig, type LevelState, type Piece } from '../engine/types.ts';

export interface PixelDropSceneOptions {
  readonly level: LevelConfig;
  readonly onComplete: () => void;
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

const SYMBOLS: Readonly<Record<ColorId, string>> = {
  coral: '◆',
  rose: '●',
  purple: '▲',
};

const COLOR_NAMES: Readonly<Record<ColorId, string>> = {
  coral: 'оранжевый',
  rose: 'розовый',
  purple: 'фиолетовый',
};

function div(className: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  return element;
}

export class PixelDropScene {
  readonly #options: PixelDropSceneOptions;
  #state: LevelState;
  #root!: HTMLElement;
  #board!: HTMLElement;
  #progress!: HTMLElement;
  #tray!: HTMLElement;
  #boardCells: HTMLButtonElement[] = [];
  #traySlots: HTMLButtonElement[] = [];
  #drag: DragState | null = null;
  #suppressClick = false;
  #completeTimer: number | null = null;
  #completed = false;

  constructor(options: PixelDropSceneOptions) {
    this.#options = options;
    this.#state = pixelDropEngine.create(options.level);
  }

  mount(container: HTMLElement): void {
    this.#root = this.#build();
    container.replaceChildren(this.#root);
    this.#root.addEventListener('click', this.#onClick);
    this.#root.addEventListener('pointerdown', this.#onPointerDown);
    window.addEventListener('pointermove', this.#onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.#onPointerUp);
    window.addEventListener('pointercancel', this.#onPointerUp);
    this.#render();
  }

  restart(): void {
    if (this.#completeTimer !== null) window.clearTimeout(this.#completeTimer);
    this.#completeTimer = null;
    this.#completed = false;
    this.#state = pixelDropEngine.create(this.#options.level);
    this.#render();
  }

  destroy(): void {
    if (this.#completeTimer !== null) window.clearTimeout(this.#completeTimer);
    window.removeEventListener('pointermove', this.#onPointerMove);
    window.removeEventListener('pointerup', this.#onPointerUp);
    window.removeEventListener('pointercancel', this.#onPointerUp);
    this.#removeDragPreview();
    this.#root.remove();
  }

  #build(): HTMLElement {
    const root = document.createElement('article');
    root.className = 'pixel-drop-app';
    root.style.setProperty('--size', String(GRID_SIZE));
    root.dataset['testid'] = 'pixel-drop-app';

    const intro = document.createElement('section');
    intro.className = 'pixel-drop-intro';
    const copy = div('pixel-drop-intro__copy');
    const title = document.createElement('h1');
    title.textContent = this.#options.level.title;
    const instruction = document.createElement('p');
    instruction.className = 'pixel-drop-instruction';
    instruction.textContent = this.#options.level.instruction;
    copy.append(title, instruction);
    intro.append(copy, this.#buildSample());

    const card = div('pixel-drop-board-card');
    card.dataset['testid'] = 'pixel-drop-board-card';
    const meta = div('pixel-drop-board-meta');
    const metaTitle = document.createElement('span');
    metaTitle.textContent = 'СОБЕРИ РИСУНОК';
    this.#progress = document.createElement('span');
    this.#progress.dataset['testid'] = 'pixel-drop-progress';
    meta.append(metaTitle, this.#progress);

    const layout = div('pixel-drop-board-layout');
    this.#board = div('pixel-drop-board');
    this.#board.setAttribute('role', 'grid');
    this.#board.setAttribute('aria-label', 'Игровое поле 6 на 6');
    this.#board.dataset['testid'] = 'pixel-drop-board';
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'pixel-drop-board-cell';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', 'Строка ' + String(row + 1) + ', столбец ' + String(col + 1));
        cell.dataset['row'] = String(row);
        cell.dataset['col'] = String(col);
        cell.dataset['testid'] = 'pixel-drop-cell-' + String(row) + '-' + String(col);
        this.#boardCells.push(cell);
        this.#board.append(cell);
      }
    }
    layout.append(this.#board);

    const caption = div('pixel-drop-board-caption');
    const captionDot = document.createElement('span');
    captionDot.className = 'pixel-drop-caption-dot';
    caption.append(captionDot, 'Можно переставлять сколько угодно');
    card.append(meta, layout, caption);

    const trayArea = document.createElement('section');
    trayArea.className = 'pixel-drop-tray-area';
    trayArea.setAttribute('aria-label', 'Доступные фигуры');
    const trayHeading = div('pixel-drop-tray-heading');
    const trayTitle = document.createElement('h2');
    trayTitle.append('Твои фигуры ');
    const trayCount = document.createElement('span');
    trayCount.textContent = String(this.#state.pieces.length);
    trayTitle.append(trayCount);
    const trayHint = document.createElement('span');
    trayHint.textContent = 'Перетаскивай на поле';
    trayHeading.append(trayTitle, trayHint);

    this.#tray = div('pixel-drop-tray');
    this.#state.pieces.forEach((piece, index) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'pixel-drop-tray-slot';
      slot.dataset['pieceId'] = piece.id;
      slot.dataset['testid'] = 'pixel-drop-piece-' + String(index + 1);
      slot.setAttribute('aria-label', this.#pieceAriaLabel(piece));
      this.#traySlots.push(slot);
      this.#tray.append(slot);
    });
    trayArea.append(trayHeading, this.#tray);

    const footer = document.createElement('footer');
    footer.className = 'pixel-drop-footer';
    const footerCopy = document.createElement('span');
    footerCopy.textContent = 'Двигай и пробуй свободно.';
    const restart = document.createElement('button');
    restart.type = 'button';
    restart.dataset['action'] = 'restart';
    restart.dataset['testid'] = 'pixel-drop-restart';
    restart.innerHTML = '<span aria-hidden="true">↻</span> Заново';
    footer.append(footerCopy, restart);

    root.append(intro, card, trayArea, footer);
    return root;
  }

  #buildSample(): HTMLElement {
    const box = div('pixel-drop-sample-box');
    const sample = div('pixel-drop-sample');
    sample.setAttribute('role', 'img');
    sample.setAttribute('aria-label', this.#options.level.sampleAlt);
    this.#options.level.target.flat().forEach((color) => {
      const cell = document.createElement('span');
      if (color !== null) cell.className = color;
      sample.append(cell);
    });
    const label = document.createElement('span');
    label.textContent = 'ОБРАЗЕЦ';
    box.append(sample, label);
    return box;
  }

  #buildPiece(piece: Piece, cellSize: number): HTMLElement {
    const shape = div('pixel-drop-piece-shape');
    const maxRow = Math.max(...piece.cells.map((cell) => cell.offset[0]));
    const maxCol = Math.max(...piece.cells.map((cell) => cell.offset[1]));
    shape.style.width = String((maxCol + 1) * cellSize) + 'px';
    shape.style.height = String((maxRow + 1) * cellSize) + 'px';

    for (const pieceCell of piece.cells) {
      const pixel = document.createElement('span');
      pixel.className = 'pixel-drop-pixel ' + pieceCell.color;
      pixel.dataset['dr'] = String(pieceCell.offset[0]);
      pixel.dataset['dc'] = String(pieceCell.offset[1]);
      pixel.style.left = String(pieceCell.offset[1] * cellSize) + 'px';
      pixel.style.top = String(pieceCell.offset[0] * cellSize) + 'px';
      pixel.style.width = String(cellSize) + 'px';
      pixel.style.height = String(cellSize) + 'px';
      const symbol = document.createElement('i');
      symbol.textContent = SYMBOLS[pieceCell.color];
      pixel.append(symbol);
      shape.append(pixel);
    }
    return shape;
  }

  #pieceAriaLabel(piece: Piece): string {
    return 'Фигура ' + piece.label + ', ' + piece.cells.map((cell) => COLOR_NAMES[cell.color]).join(', ');
  }

  #render(): void {
    this.#progress.textContent = String(this.#state.placements.length) + ' / ' + String(this.#state.pieces.length) + ' фигур';
    this.#board.classList.toggle('won', this.#state.gameState === 'won');

    this.#boardCells.forEach((button, index) => {
      const row = Math.floor(index / GRID_SIZE);
      const col = index % GRID_SIZE;
      const cell = this.#state.grid[row]?.[col] ?? null;
      button.className = 'pixel-drop-board-cell';
      button.replaceChildren();
      delete button.dataset['pieceId'];
      if (cell === null) return;
      button.classList.add('occupied', cell.color);
      button.dataset['pieceId'] = cell.pieceId;
      if (this.#state.selectedPieceId === cell.pieceId) button.classList.add('selected');
      const symbol = document.createElement('span');
      symbol.className = 'pixel-drop-cell-symbol';
      symbol.textContent = SYMBOLS[cell.color];
      button.append(symbol);
    });

    this.#traySlots.forEach((slot, index) => {
      const piece = this.#state.pieces[index];
      if (piece === undefined) return;
      const isPlaced = this.#state.placements.some((placement) => placement.pieceId === piece.id);
      slot.className = 'pixel-drop-tray-slot';
      slot.replaceChildren();
      slot.setAttribute('aria-pressed', String(this.#state.selectedPieceId === piece.id));
      if (isPlaced) {
        slot.classList.add('used');
      } else {
        slot.append(this.#buildPiece(piece, 22));
      }
      if (this.#state.selectedPieceId === piece.id) slot.classList.add('chosen');
    });
  }

  #applyPlace(pieceId: string, row: number, col: number): boolean {
    const next = pixelDropEngine.apply(this.#state, { type: 'place_piece', pieceId, row, col });
    if (next === this.#state) return false;
    this.#state = next;
    this.#render();
    if (next.gameState === 'won' && !this.#completed) {
      this.#completed = true;
      this.#completeTimer = window.setTimeout(() => this.#options.onComplete(), 560);
    }
    return true;
  }

  readonly #onClick = (event: MouseEvent): void => {
    if (this.#suppressClick) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('[data-action="restart"]') !== null) {
      this.restart();
      return;
    }

    const slot = target.closest<HTMLButtonElement>('.pixel-drop-tray-slot');
    if (slot !== null) {
      const pieceId = slot.dataset['pieceId'];
      if (pieceId === undefined || slot.classList.contains('used')) return;
      this.#state = pixelDropEngine.apply(this.#state, { type: 'select_piece', pieceId });
      this.#render();
      return;
    }

    const cell = target.closest<HTMLButtonElement>('.pixel-drop-board-cell');
    if (cell === null) return;
    const row = Number(cell.dataset['row']);
    const col = Number(cell.dataset['col']);
    if (this.#state.selectedPieceId !== null) {
      if (!this.#applyPlace(this.#state.selectedPieceId, row, col)) this.#flashInvalid(cell);
      return;
    }
    const pieceId = cell.dataset['pieceId'];
    if (pieceId !== undefined) {
      this.#state = pixelDropEngine.apply(this.#state, { type: 'select_piece', pieceId });
      this.#render();
    }
  };

  readonly #onPointerDown = (event: PointerEvent): void => {
    if (this.#state.gameState === 'won') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const slot = target.closest<HTMLButtonElement>('.pixel-drop-tray-slot:not(.used)');
    const boardCell = target.closest<HTMLButtonElement>('.pixel-drop-board-cell.occupied');
    const pieceId = slot?.dataset['pieceId'] ?? boardCell?.dataset['pieceId'];
    if (pieceId === undefined) return;

    let offsetRow = Number(target.closest<HTMLElement>('.pixel-drop-pixel')?.dataset['dr'] ?? 0);
    let offsetCol = Number(target.closest<HTMLElement>('.pixel-drop-pixel')?.dataset['dc'] ?? 0);
    if (boardCell !== null) {
      const placement = this.#state.placements.find((item) => item.pieceId === pieceId);
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
    if (!drag.moved && distance < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      this.#suppressClick = true;
      const piece = this.#state.pieces.find((item) => item.id === drag.pieceId);
      if (piece === undefined) return;
      drag.preview = this.#buildPiece(piece, this.#boardCells[0]?.getBoundingClientRect().width ?? 44);
      drag.preview.classList.add('pixel-drop-drag-piece');
      document.body.append(drag.preview);
      this.#root.querySelectorAll<HTMLElement>('[data-piece-id="' + drag.pieceId + '"]').forEach((cell) => {
        if (cell.classList.contains('pixel-drop-board-cell')) cell.classList.add('being-dragged');
      });
    }
    this.#positionDrag(event.clientX, event.clientY);
    event.preventDefault();
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.pixel-drop-board-cell');
      if (hit !== null && hit !== undefined) {
        const row = Number(hit.dataset['row']) - drag.offsetRow;
        const col = Number(hit.dataset['col']) - drag.offsetCol;
        if (!this.#applyPlace(drag.pieceId, row, col)) this.#flashInvalid(hit);
      }
    }
    this.#removeDragPreview();
    this.#drag = null;
    window.setTimeout(() => {
      this.#suppressClick = false;
    }, 0);
  };

  #positionDrag(clientX: number, clientY: number): void {
    const drag = this.#drag;
    if (drag?.preview === null || drag?.preview === undefined) return;
    const cellSize = this.#boardCells[0]?.getBoundingClientRect().width ?? 44;
    drag.preview.style.left = String(clientX - (drag.offsetCol + 0.5) * cellSize) + 'px';
    drag.preview.style.top = String(clientY - (drag.offsetRow + 0.5) * cellSize) + 'px';
  }

  #removeDragPreview(): void {
    this.#drag?.preview?.remove();
    if (this.#root !== undefined) {
      this.#root.querySelectorAll('.being-dragged').forEach((cell) => cell.classList.remove('being-dragged'));
    }
  }

  #flashInvalid(cell: HTMLElement): void {
    cell.classList.remove('invalid');
    void cell.offsetWidth;
    cell.classList.add('invalid');
    window.setTimeout(() => cell.classList.remove('invalid'), 220);
  }
}
