import { GRID_SIZE, type LevelConfig, type LevelState, type Piece } from '../engine/types.ts';
import { createButton, createDiv } from './dom.ts';
import { createPieceGraphic, pieceAriaLabel, PIECE_SYMBOLS } from './pieceGraphics.ts';

export class PixelDropView {
  readonly #level: LevelConfig;
  readonly #root: HTMLElement;
  readonly #board: HTMLElement;
  readonly #progress: HTMLElement;
  readonly #boardCells: readonly HTMLButtonElement[];
  readonly #traySlots: readonly HTMLButtonElement[];
  readonly #effectTimers = new Set<number>();

  constructor(level: LevelConfig) {
    this.#level = level;
    const built = this.#build();
    this.#root = built.root;
    this.#board = built.board;
    this.#progress = built.progress;
    this.#boardCells = built.boardCells;
    this.#traySlots = built.traySlots;
  }

  get element(): HTMLElement {
    return this.#root;
  }

  mount(container: HTMLElement): void {
    container.replaceChildren(this.#root);
  }

  destroy(): void {
    this.#effectTimers.forEach((timer) => window.clearTimeout(timer));
    this.#effectTimers.clear();
    this.#root.remove();
  }

  render(state: LevelState): void {
    this.#progress.textContent =
      String(state.placements.length) + ' / ' + String(state.pieces.length) + ' фигур';
    this.#board.classList.toggle('won', state.gameState === 'won');

    this.#boardCells.forEach((button, index) => {
      const row = Math.floor(index / GRID_SIZE);
      const col = index % GRID_SIZE;
      const cell = state.grid[row]?.[col] ?? null;
      button.className = 'pixel-drop-board-cell';
      button.replaceChildren();
      delete button.dataset['pieceId'];
      if (cell === null) return;

      button.classList.add('occupied', cell.color);
      button.dataset['pieceId'] = cell.pieceId;
      if (state.selectedPieceId === cell.pieceId) button.classList.add('selected');

      const symbol = document.createElement('span');
      symbol.className = 'pixel-drop-cell-symbol';
      symbol.textContent = PIECE_SYMBOLS[cell.color];
      button.append(symbol);
    });

    this.#traySlots.forEach((slot, index) => {
      const piece = state.pieces[index];
      if (piece === undefined) return;
      const isPlaced = state.placements.some((placement) => placement.pieceId === piece.id);
      slot.className = 'pixel-drop-tray-slot';
      slot.replaceChildren();
      slot.setAttribute('aria-pressed', String(state.selectedPieceId === piece.id));

      if (isPlaced) slot.classList.add('used');
      else slot.append(createPieceGraphic(piece, 22));
      if (state.selectedPieceId === piece.id) slot.classList.add('chosen');
    });
  }

  getPiece(pieceId: string): Piece | null {
    return this.#level.pieces.find((piece) => piece.id === pieceId) ?? null;
  }

  getBoardCellSize(): number {
    return this.#boardCells[0]?.getBoundingClientRect().width ?? 44;
  }

  getBoardCellAtPoint(clientX: number, clientY: number): HTMLElement | null {
    return document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('.pixel-drop-board-cell') ?? null;
  }

  createDragPreview(pieceId: string): HTMLElement | null {
    const piece = this.getPiece(pieceId);
    if (piece === null) return null;
    const preview = createPieceGraphic(piece, this.getBoardCellSize());
    preview.classList.add('pixel-drop-drag-piece');
    document.body.append(preview);
    return preview;
  }

  setDraggedPiece(pieceId: string | null): void {
    this.#root.querySelectorAll('.being-dragged').forEach((cell) => cell.classList.remove('being-dragged'));
    if (pieceId === null) return;

    this.#root.querySelectorAll<HTMLElement>('[data-piece-id="' + pieceId + '"]').forEach((cell) => {
      if (cell.classList.contains('pixel-drop-board-cell')) cell.classList.add('being-dragged');
    });
  }

  flashInvalid(cell: HTMLElement): void {
    cell.classList.remove('invalid');
    void cell.offsetWidth;
    cell.classList.add('invalid');
    const timer = window.setTimeout(() => {
      cell.classList.remove('invalid');
      this.#effectTimers.delete(timer);
    }, 220);
    this.#effectTimers.add(timer);
  }

  #build(): {
    root: HTMLElement;
    board: HTMLElement;
    progress: HTMLElement;
    boardCells: readonly HTMLButtonElement[];
    traySlots: readonly HTMLButtonElement[];
  } {
    const root = document.createElement('article');
    root.className = 'pixel-drop-app';
    root.style.setProperty('--size', String(GRID_SIZE));
    root.dataset['testid'] = 'pixel-drop-app';

    root.append(this.#buildIntro());

    const card = createDiv('pixel-drop-board-card');
    card.dataset['testid'] = 'pixel-drop-board-card';
    const meta = createDiv('pixel-drop-board-meta');
    const metaTitle = document.createElement('span');
    metaTitle.textContent = 'СОБЕРИ РИСУНОК';
    const progress = document.createElement('span');
    progress.dataset['testid'] = 'pixel-drop-progress';
    meta.append(metaTitle, progress);

    const layout = createDiv('pixel-drop-board-layout');
    const board = createDiv('pixel-drop-board');
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', 'Игровое поле 6 на 6');
    board.dataset['testid'] = 'pixel-drop-board';
    const boardCells: HTMLButtonElement[] = [];
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const cell = createButton('pixel-drop-board-cell', 'pixel-drop-cell-' + String(row) + '-' + String(col));
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', 'Строка ' + String(row + 1) + ', столбец ' + String(col + 1));
        cell.dataset['row'] = String(row);
        cell.dataset['col'] = String(col);
        boardCells.push(cell);
        board.append(cell);
      }
    }
    layout.append(board);

    const caption = createDiv('pixel-drop-board-caption');
    const captionDot = document.createElement('span');
    captionDot.className = 'pixel-drop-caption-dot';
    caption.append(captionDot, 'Можно переставлять сколько угодно');
    card.append(meta, layout, caption);
    root.append(card);

    const trayArea = document.createElement('section');
    trayArea.className = 'pixel-drop-tray-area';
    trayArea.setAttribute('aria-label', 'Доступные фигуры');
    const trayHeading = createDiv('pixel-drop-tray-heading');
    const trayTitle = document.createElement('h2');
    trayTitle.append('Твои фигуры ');
    const trayCount = document.createElement('span');
    trayCount.textContent = String(this.#level.pieces.length);
    trayTitle.append(trayCount);
    const trayHint = document.createElement('span');
    trayHint.textContent = 'Перетаскивай на поле';
    trayHeading.append(trayTitle, trayHint);

    const tray = createDiv('pixel-drop-tray');
    const traySlots = this.#level.pieces.map((piece, index) => {
      const slot = createButton('pixel-drop-tray-slot', 'pixel-drop-piece-' + String(index + 1));
      slot.dataset['pieceId'] = piece.id;
      slot.setAttribute('aria-label', pieceAriaLabel(piece));
      tray.append(slot);
      return slot;
    });
    trayArea.append(trayHeading, tray);
    root.append(trayArea, this.#buildFooter());

    return { root, board, progress, boardCells, traySlots };
  }

  #buildIntro(): HTMLElement {
    const intro = document.createElement('section');
    intro.className = 'pixel-drop-intro';
    const copy = createDiv('pixel-drop-intro__copy');
    const title = document.createElement('h1');
    title.textContent = this.#level.title;
    const instruction = document.createElement('p');
    instruction.className = 'pixel-drop-instruction';
    instruction.textContent = this.#level.instruction;
    copy.append(title, instruction);
    intro.append(copy, this.#buildSample());
    return intro;
  }

  #buildSample(): HTMLElement {
    const box = createDiv('pixel-drop-sample-box');
    const sample = createDiv('pixel-drop-sample');
    sample.setAttribute('role', 'img');
    sample.setAttribute('aria-label', this.#level.sampleAlt);
    this.#level.target.flat().forEach((color) => {
      const cell = document.createElement('span');
      if (color !== null) cell.className = color;
      sample.append(cell);
    });
    const label = document.createElement('span');
    label.textContent = 'ОБРАЗЕЦ';
    box.append(sample, label);
    return box;
  }

  #buildFooter(): HTMLElement {
    const footer = document.createElement('footer');
    footer.className = 'pixel-drop-footer';
    const copy = document.createElement('span');
    copy.textContent = 'Двигай и пробуй свободно.';
    const restart = createButton('', 'pixel-drop-restart');
    restart.dataset['action'] = 'restart';
    restart.innerHTML = '<span aria-hidden="true">↻</span> Заново';
    footer.append(copy, restart);
    return footer;
  }
}
