import Phaser from 'phaser';
import { pixelDropEngine, validAnchorsForPiece } from '../engine/pixelDropEngine.ts';
import { GRID_SIZE, TRAY_SIZE, type ColorId, type LevelConfig, type LevelState, type Piece } from '../engine/types.ts';
import type { SceneTheme } from './theme.ts';

/** Board margin reserved for row/col hints, in cell units. */
const HINT_MARGIN_CELLS = 2;
/** Vertical space reserved for the tray below the board, in cell units. */
const TRAY_ROWS = 1.3;
const TRAY_GAP_CELLS = 0.25;
const MIN_CELL_SIZE = 18;

const CELL_PADDING_RATIO = 0.06;
const ICON_RATIO = 0.32;

export interface PixelDropSceneOptions {
  level: LevelConfig;
  theme: SceneTheme;
  onComplete: () => void;
  onStateChange: (state: LevelState) => void;
}

type HitTarget =
  | { type: 'cell'; row: number; col: number }
  | { type: 'piece'; slot: 0 | 1 | 2 }
  | { type: 'background' };

interface Layout {
  cellSize: number;
  boardX: number;
  boardY: number;
  trayY: number;
  trayHeight: number;
  traySlotWidth: number;
}

/**
 * The rendering and input half of the mechanic.
 *
 * All rules live in ../engine — this scene only draws state and turns pointer
 * events into engine inputs. Hit-testing is a single geometric lookup against
 * the layout computed on resize, rather than per-object hitareas on 60+ board
 * cells: simpler, and it is what makes distinguishing "tapped nothing"
 * (rule "tap_background") from "tapped a cell" trivial.
 */
export class PixelDropScene extends Phaser.Scene {
  readonly #options: PixelDropSceneOptions;
  #state: LevelState;
  #completed = false;
  #layout: Layout | null = null;

  #board!: Phaser.GameObjects.Graphics;
  #hints!: Phaser.GameObjects.Graphics;
  #tray!: Phaser.GameObjects.Graphics;
  #texts: Phaser.GameObjects.Text[] = [];
  #stuckText!: Phaser.GameObjects.Text;

  #handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.cameras.resize(gameSize.width, gameSize.height);
    this.#computeLayout(gameSize.width, gameSize.height);
    this.#redraw();
  };

  constructor(options: PixelDropSceneOptions) {
    super({ key: 'pixel-drop' });
    this.#options = options;
    this.#state = pixelDropEngine.create(options.level);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.#options.theme.background);

    this.#hints = this.add.graphics();
    this.#board = this.add.graphics();
    this.#tray = this.add.graphics();
    this.#stuckText = this.add
      .text(0, 0, 'Нет ходов — откати или начни заново', {
        fontSize: '14px',
        color: this.#colorToCss(this.#options.theme.hintWrong),
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.#computeLayout(this.scale.width, this.scale.height);
    this.#redraw();
    this.#options.onStateChange(this.#state);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.#handleTap(pointer.x, pointer.y);
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.#handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.#handleResize);
    });
  }

  /** Called by the mechanic's own Undo/Restart buttons — see src/mechanic/index.ts. */
  undo(): void {
    this.#applyInput({ type: 'tap_undo' });
  }

  restart(): void {
    this.#state = pixelDropEngine.create(this.#options.level);
    this.#completed = false;
    this.#redraw();
    this.#options.onStateChange(this.#state);
  }

  // --- Layout --------------------------------------------------------------

  #computeLayout(width: number, height: number): void {
    const totalCols = HINT_MARGIN_CELLS + GRID_SIZE;
    const totalRows = HINT_MARGIN_CELLS + GRID_SIZE + TRAY_ROWS;
    const cellSize = Math.max(MIN_CELL_SIZE, Math.min(width / totalCols, height / totalRows));

    const usedWidth = cellSize * totalCols;
    const usedHeight = cellSize * totalRows;
    const offsetX = (width - usedWidth) / 2;
    const offsetY = (height - usedHeight) / 2;

    const boardX = offsetX + cellSize * HINT_MARGIN_CELLS;
    const boardY = offsetY + cellSize * HINT_MARGIN_CELLS;
    const trayY = boardY + cellSize * GRID_SIZE + cellSize * TRAY_GAP_CELLS;

    this.#layout = {
      cellSize,
      boardX,
      boardY,
      trayY,
      trayHeight: cellSize * (TRAY_ROWS - TRAY_GAP_CELLS),
      traySlotWidth: (cellSize * GRID_SIZE) / TRAY_SIZE,
    };
  }

  #hitTest(x: number, y: number): HitTarget {
    const layout = this.#layout;
    if (layout === null) return { type: 'background' };
    const boardSize = layout.cellSize * GRID_SIZE;

    if (x >= layout.boardX && x < layout.boardX + boardSize && y >= layout.boardY && y < layout.boardY + boardSize) {
      const col = Math.floor((x - layout.boardX) / layout.cellSize);
      const row = Math.floor((y - layout.boardY) / layout.cellSize);
      return { type: 'cell', row, col };
    }

    if (
      x >= layout.boardX &&
      x < layout.boardX + boardSize &&
      y >= layout.trayY &&
      y < layout.trayY + layout.trayHeight
    ) {
      const slot = Math.min(TRAY_SIZE - 1, Math.floor((x - layout.boardX) / layout.traySlotWidth));
      return { type: 'piece', slot: slot as 0 | 1 | 2 };
    }

    return { type: 'background' };
  }

  // --- Input -----------------------------------------------------------------

  #handleTap(x: number, y: number): void {
    if (this.#completed) return;
    const target = this.#hitTest(x, y);

    switch (target.type) {
      case 'cell':
        this.#applyInput({ type: 'tap_cell', row: target.row, col: target.col }, x, y);
        return;
      case 'piece':
        this.#applyInput({ type: 'tap_piece', traySlot: target.slot });
        return;
      case 'background':
        this.#applyInput({ type: 'tap_background' });
    }
  }

  #applyInput(input: Parameters<typeof pixelDropEngine.apply>[1], flashX?: number, flashY?: number): void {
    const before = this.#state;
    const after = pixelDropEngine.apply(before, input);

    // A tap_cell with a selection that changed nothing was a rejected
    // placement (out of bounds or occupied) — rule "короткая анимация
    // ошибки". A no-op with no selection is silent, matching docs/rules.md.
    if (after === before) {
      if (input.type === 'tap_cell' && before.selectedPieceIdx !== null && flashX !== undefined && flashY !== undefined) {
        this.#flashError(flashX, flashY);
      }
      return;
    }

    this.#state = after;
    this.#redraw();
    this.#options.onStateChange(this.#state);

    if (pixelDropEngine.isComplete(this.#state) && !this.#completed) {
      this.#completed = true;
      this.#playWinAnimation();
    }
  }

  // --- Drawing -----------------------------------------------------------------

  #redraw(): void {
    const layout = this.#layout;
    if (layout === null) return;

    for (const text of this.#texts) text.destroy();
    this.#texts = [];

    this.#drawBoard(layout);
    this.#drawHints(layout);
    this.#drawTray(layout);

    this.#stuckText.setVisible(this.#state.isStuck);
    if (this.#state.isStuck) {
      this.#stuckText.setPosition(layout.boardX + (layout.cellSize * GRID_SIZE) / 2, layout.trayY + layout.trayHeight + 14);
    }
  }

  #drawBoard(layout: Layout): void {
    this.#board.clear();
    const theme = this.#options.theme;
    const pad = layout.cellSize * CELL_PADDING_RATIO;

    const selectedPiece = this.#selectedPiece();
    const validAnchors =
      selectedPiece === null ? [] : validAnchorsForPiece(this.#state.grid, this.#state.activeCells, selectedPiece);
    const validAnchorKeys = new Set(validAnchors.map((a) => `${String(a.row)},${String(a.col)}`));

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const x = layout.boardX + col * layout.cellSize;
        const y = layout.boardY + row * layout.cellSize;
        const active = this.#state.activeCells[row]?.[col] === true;
        const cell = this.#state.grid[row]?.[col] ?? null;

        if (!active) {
          this.#board.fillStyle(theme.cellInactive, 1);
          this.#board.fillRect(x + pad, y + pad, layout.cellSize - pad * 2, layout.cellSize - pad * 2);
          continue;
        }

        const isValidAnchor = validAnchorKeys.has(`${String(row)},${String(col)}`);
        this.#board.fillStyle(isValidAnchor ? theme.hintOk : theme.cellEmpty, isValidAnchor ? 0.22 : 1);
        this.#board.fillRect(x + pad, y + pad, layout.cellSize - pad * 2, layout.cellSize - pad * 2);
        this.#board.lineStyle(1, theme.cellBorder, 1);
        this.#board.strokeRect(x + pad, y + pad, layout.cellSize - pad * 2, layout.cellSize - pad * 2);

        if (cell !== null) {
          this.#drawIcon(this.#board, cell.color, x + layout.cellSize / 2, y + layout.cellSize / 2, layout.cellSize * ICON_RATIO);
        }
      }
    }
  }

  #drawHints(layout: Layout): void {
    this.#hints.clear();
    const iconSize = layout.cellSize * 0.16;

    this.#state.rowHints.forEach((hint, row) => {
      if (hint.length === 0) return;
      const status = this.#state.lineStatus.rows[row] ?? 'pending';
      const cy = layout.boardY + row * layout.cellSize + layout.cellSize / 2;
      const stepX = (layout.cellSize * HINT_MARGIN_CELLS) / (hint.length + 1);

      hint.forEach((run, i) => {
        const cx = layout.boardX - layout.cellSize * HINT_MARGIN_CELLS + stepX * (i + 0.5);
        this.#drawIcon(this.#hints, run.color, cx, cy - iconSize * 0.9, iconSize);
        this.#addText(String(run.count), cx, cy + iconSize * 0.9, this.#statusColor(status));
      });
    });

    for (let col = 0; col < GRID_SIZE; col += 1) {
      const hint = this.#state.colHints[col] ?? [];
      if (hint.length === 0) continue;
      const status = this.#state.lineStatus.cols[col] ?? 'pending';
      const cx = layout.boardX + col * layout.cellSize + layout.cellSize / 2;
      const stepY = (layout.cellSize * HINT_MARGIN_CELLS) / (hint.length + 1);

      hint.forEach((run, i) => {
        const cy = layout.boardY - layout.cellSize * HINT_MARGIN_CELLS + stepY * (i + 0.5);
        this.#drawIcon(this.#hints, run.color, cx - iconSize * 0.9, cy, iconSize);
        this.#addText(String(run.count), cx + iconSize * 0.9, cy, this.#statusColor(status));
      });
    }
  }

  #drawTray(layout: Layout): void {
    this.#tray.clear();
    const theme = this.#options.theme;

    this.#state.tray.forEach((piece, slot) => {
      const slotX = layout.boardX + layout.traySlotWidth * slot;
      const selected = this.#state.selectedPieceIdx === slot;
      const scale = selected ? 1.12 : 1;

      this.#tray.lineStyle(selected ? 2 : 1, selected ? theme.hintOk : theme.cellBorder, 1);
      this.#tray.strokeRect(slotX + 4, layout.trayY + 4, layout.traySlotWidth - 8, layout.trayHeight - 8);

      if (piece === null) return;

      const cx = slotX + layout.traySlotWidth / 2;
      const cy = layout.trayY + layout.trayHeight / 2;
      const miniCell = (layout.trayHeight * 0.34) * scale;
      const offsets = piece.cells.map((c) => c.offset);
      const rows = offsets.map((o) => o[0]);
      const cols = offsets.map((o) => o[1]);
      const midRow = (Math.min(...rows) + Math.max(...rows)) / 2;
      const midCol = (Math.min(...cols) + Math.max(...cols)) / 2;

      for (const pieceCell of piece.cells) {
        const px = cx + (pieceCell.offset[1] - midCol) * miniCell;
        const py = cy + (pieceCell.offset[0] - midRow) * miniCell;
        this.#tray.fillStyle(theme.colors[pieceCell.color], 1);
        this.#tray.fillRect(px - miniCell / 2 + 1, py - miniCell / 2 + 1, miniCell - 2, miniCell - 2);
      }
    });
  }

  #selectedPiece(): Piece | null {
    if (this.#state.selectedPieceIdx === null) return null;
    return this.#state.tray[this.#state.selectedPieceIdx] ?? null;
  }

  #drawIcon(g: Phaser.GameObjects.Graphics, color: ColorId, cx: number, cy: number, r: number): void {
    const theme = this.#options.theme;
    g.fillStyle(theme.colors[color], 1);

    switch (color) {
      case 'red':
        g.fillCircle(cx, cy, r);
        return;
      case 'blue':
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
        return;
      case 'green':
        g.fillTriangle(cx, cy - r, cx - r, cy + r * 0.8, cx + r, cy + r * 0.8);
        return;
      case 'yellow':
        g.fillPoints(
          [
            new Phaser.Math.Vector2(cx, cy - r),
            new Phaser.Math.Vector2(cx + r, cy),
            new Phaser.Math.Vector2(cx, cy + r),
            new Phaser.Math.Vector2(cx - r, cy),
          ],
          true,
        );
        return;
      case 'purple':
        g.fillRect(cx - r * 0.32, cy - r, r * 0.64, r * 2);
        g.fillRect(cx - r, cy - r * 0.32, r * 2, r * 0.64);
    }
  }

  #addText(text: string, x: number, y: number, color: string): void {
    const node = this.add.text(x, y, text, { fontSize: '11px', color }).setOrigin(0.5);
    this.#texts.push(node);
  }

  #statusColor(status: 'ok' | 'pending' | 'wrong'): string {
    const theme = this.#options.theme;
    if (status === 'ok') return this.#colorToCss(theme.hintOk);
    if (status === 'wrong') return this.#colorToCss(theme.hintWrong);
    return this.#colorToCss(theme.hintPending);
  }

  #colorToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
  }

  #flashError(x: number, y: number): void {
    const marker = this.add.circle(x, y, 6, this.#options.theme.hintWrong, 0.8);
    this.tweens.add({
      targets: marker,
      scale: 2,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => {
        marker.destroy();
      },
    });
  }

  /** Rule: cells "проявляются волной от центра" — nearer cells pop first. */
  #playWinAnimation(): void {
    const layout = this.#layout;
    if (layout === null) {
      this.#options.onComplete();
      return;
    }

    const boardCenterX = layout.boardX + (layout.cellSize * GRID_SIZE) / 2;
    const boardCenterY = layout.boardY + (layout.cellSize * GRID_SIZE) / 2;
    let maxDelay = 0;

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        if (this.#state.grid[row]?.[col] === null || this.#state.activeCells[row]?.[col] !== true) continue;

        const x = layout.boardX + col * layout.cellSize + layout.cellSize / 2;
        const y = layout.boardY + row * layout.cellSize + layout.cellSize / 2;
        const distance = Phaser.Math.Distance.Between(x, y, boardCenterX, boardCenterY);
        const delay = Math.min(400, distance * 4);
        maxDelay = Math.max(maxDelay, delay);

        const pop = this.add.circle(x, y, layout.cellSize * 0.1, this.#options.theme.hintOk, 0);
        this.tweens.add({
          targets: pop,
          scale: { from: 0.2, to: 4 },
          alpha: { from: 0.9, to: 0 },
          delay,
          duration: 220,
          ease: 'Quad.easeOut',
          onComplete: () => {
            pop.destroy();
          },
        });
      }
    }

    this.time.delayedCall(maxDelay + 250, this.#options.onComplete);
  }
}
