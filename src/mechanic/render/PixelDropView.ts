import { GRID_SIZE, type LevelConfig, type LevelState, type Piece } from '../engine/types.ts';
import { createButton, createDiv } from './dom.ts';
import { createPieceGraphic, pieceAriaLabel, PIECE_SYMBOLS } from './pieceGraphics.ts';

export class PixelDropView {
  #pieces: readonly Piece[];
  readonly #root: HTMLElement;
  readonly #board: HTMLElement;
  readonly #progress: HTMLElement;
  readonly #title: HTMLElement;
  readonly #instruction: HTMLElement;
  readonly #sample: HTMLElement;
  readonly #boardCells: readonly HTMLButtonElement[];
  readonly #effectTimers = new Set<number>();

  constructor(level: LevelConfig) {
    this.#pieces = level.phases[0]?.pieces ?? [];
    const built = this.#build();
    this.#root = built.root;
    this.#board = built.board;
    this.#progress = built.progress;
    this.#title = built.title;
    this.#instruction = built.instruction;
    this.#sample = built.sample;
    this.#boardCells = built.boardCells;
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
    const phase = state.phases[state.phaseIndex];
    if (phase === undefined) return;
    const phaseNumber = state.phaseIndex + 1;
    const phaseCount = state.phases.length;
    this.#pieces = state.pieces;
    this.#title.textContent = phase.title;
    this.#instruction.textContent = phase.instruction;
    this.#sample.setAttribute('aria-label', phase.sampleAlt);
    phase.target.flat().forEach((color, index) => {
      const cell = this.#sample.children.item(index);
      if (cell instanceof HTMLElement) cell.className = color ?? '';
    });
    this.#progress.textContent =
      state.gameState === 'won'
        ? String(phaseCount) + ' из ' + String(phaseCount) + ' — готово!'
        : state.gameState === 'phase_complete'
          ? 'Картинка ' + String(phaseNumber) + ' из ' + String(phaseCount) + ' готова!'
          : 'Картинка ' + String(phaseNumber) + ' из ' + String(phaseCount);
    this.#board.classList.toggle('won', state.gameState !== 'playing');

    this.#boardCells.forEach((button, index) => {
      const row = Math.floor(index / GRID_SIZE);
      const col = index % GRID_SIZE;
      const cell = state.grid[row]?.[col] ?? null;
      button.className = 'pixel-drop-board-cell';
      button.replaceChildren();
      delete button.dataset['pieceId'];
      button.setAttribute('aria-label', 'Строка ' + String(row + 1) + ', столбец ' + String(col + 1));
      if (cell === null) return;

      button.classList.add('occupied', cell.color);
      button.dataset['pieceId'] = cell.pieceId;
      const piece = this.getPiece(cell.pieceId);
      if (piece !== null) button.setAttribute('aria-label', pieceAriaLabel(piece));
      if (state.selectedPieceId === cell.pieceId) button.classList.add('selected');

      const symbol = document.createElement('span');
      symbol.className = 'pixel-drop-cell-symbol';
      symbol.textContent = PIECE_SYMBOLS[cell.color];
      button.append(symbol);
    });

  }

  getPiece(pieceId: string): Piece | null {
    return this.#pieces.find((piece) => piece.id === pieceId) ?? null;
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
    title: HTMLElement;
    instruction: HTMLElement;
    sample: HTMLElement;
    boardCells: readonly HTMLButtonElement[];
  } {
    const root = document.createElement('article');
    root.className = 'pixel-drop-app';
    root.style.setProperty('--size', String(GRID_SIZE));
    root.dataset['testid'] = 'pixel-drop-app';

    const intro = this.#buildIntro();
    root.append(intro.element);

    const card = createDiv('pixel-drop-board-card');
    card.dataset['testid'] = 'pixel-drop-board-card';
    const meta = createDiv('pixel-drop-board-meta');
    const metaTitle = document.createElement('span');
    metaTitle.textContent = 'РАССТАВЬ ФИГУРЫ';
    const progress = document.createElement('span');
    progress.dataset['testid'] = 'pixel-drop-progress';
    meta.append(metaTitle, progress);

    const layout = createDiv('pixel-drop-board-layout');
    const board = createDiv('pixel-drop-board');
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', 'Игровое поле 10 на 10');
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
    caption.append(captionDot, 'Перетаскивай или меняй фигуры местами');
    card.append(meta, layout, caption);
    root.append(card);
    root.append(this.#buildFooter());

    return {
      root,
      board,
      progress,
      title: intro.title,
      instruction: intro.instruction,
      sample: intro.sample,
      boardCells,
    };
  }

  #buildIntro(): { element: HTMLElement; title: HTMLElement; instruction: HTMLElement; sample: HTMLElement } {
    const intro = document.createElement('section');
    intro.className = 'pixel-drop-intro';
    const copy = createDiv('pixel-drop-intro__copy');
    const title = document.createElement('h1');
    const instruction = document.createElement('p');
    instruction.className = 'pixel-drop-instruction';
    copy.append(title, instruction);
    const sampleBox = this.#buildSample();
    intro.append(copy, sampleBox.box);
    return { element: intro, title, instruction, sample: sampleBox.sample };
  }

  #buildSample(): { box: HTMLElement; sample: HTMLElement } {
    const box = createDiv('pixel-drop-sample-box');
    const sample = createDiv('pixel-drop-sample');
    sample.setAttribute('role', 'img');
    for (let index = 0; index < GRID_SIZE * GRID_SIZE; index += 1) {
      const cell = document.createElement('span');
      sample.append(cell);
    }
    const label = document.createElement('span');
    label.textContent = 'ОБРАЗЕЦ';
    box.append(sample, label);
    return { box, sample };
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
