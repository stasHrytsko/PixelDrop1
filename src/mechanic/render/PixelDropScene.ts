import Phaser from 'phaser';
import { isValidPlacement, pixelDropEngine, restoreFromPlacements } from '../engine/pixelDropEngine.ts';
import type { ColorId, LevelConfig, LevelState, Piece } from '../engine/types.ts';
import type { SavedPlacements } from '../save/SaveRepository.ts';
import type { SceneTheme } from './theme.ts';

/** Thumbnail cell size, relative to a board cell — docs/rules.md §7. */
const THUMB_SCALE = 0.42;
/** Vertical gap between thumbnail/board/tray, in cell units. */
const GAP_UNITS = 0.5;
/** Extra room around a piece's own bounding box inside its tray slot. */
const TRAY_SLOT_PADDING = 0.5;
const MIN_CELL_SIZE = 26;
/** Visual-only vertical offset so a dragged piece is not hidden under a finger. */
const LIFT_PX = 34;

const CELL_PADDING_RATIO = 0.06;
const ICON_RATIO = 0.3;

export interface PixelDropSceneOptions {
  level: LevelConfig;
  theme: SceneTheme;
  onComplete: () => void;
  onStateChange: (state: LevelState) => void;
}

interface Layout {
  cellSize: number;
  thumbX: number;
  thumbY: number;
  thumbCellSize: number;
  boardX: number;
  boardY: number;
  trayX: number;
  trayY: number;
  traySlotSize: number;
  trayColumns: number;
}

interface Bounds {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

interface Point {
  x: number;
  y: number;
}

type Zone = 'board' | 'tray' | 'none';

interface DragState {
  pieceId: string;
  grabOffsetRow: number;
  grabOffsetCol: number;
  /** Last known pointer position, already lifted (§ "Перетаскивание" rule 2). */
  point: Point;
}

function pieceBounds(piece: Piece): Bounds {
  const rows = piece.cells.map((c) => c.offset[0]);
  const cols = piece.cells.map((c) => c.offset[1]);
  return { minRow: Math.min(...rows), maxRow: Math.max(...rows), minCol: Math.min(...cols), maxCol: Math.max(...cols) };
}

function pieceSpan(piece: Piece): number {
  const bounds = pieceBounds(piece);
  return Math.max(bounds.maxRow - bounds.minRow + 1, bounds.maxCol - bounds.minCol + 1);
}

/**
 * The rendering and input half of the mechanic.
 *
 * All rules live in ../engine — this scene only draws state, turns pointer
 * drags into a preview, and turns a drop into an engine input. Because a
 * piece's anchor cell always carries offset [0, 0] (docs/rules.md §3
 * "Фигуры" rule 4), "where would this piece's anchor need to render" is the
 * same formula whether the piece sits in the tray or on the board — see
 * #pieceOrigin* below — which is what keeps drag math and rendering in sync.
 */
export class PixelDropScene extends Phaser.Scene {
  readonly #options: PixelDropSceneOptions;
  #state: LevelState;
  #completed = false;
  #layout: Layout | null = null;
  #drag: DragState | null = null;

  #thumb!: Phaser.GameObjects.Graphics;
  #board!: Phaser.GameObjects.Graphics;
  #tray!: Phaser.GameObjects.Graphics;
  #ghost!: Phaser.GameObjects.Graphics;

  #handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.cameras.resize(gameSize.width, gameSize.height);
    this.#drag = null;
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

    this.#thumb = this.add.graphics();
    this.#board = this.add.graphics();
    this.#tray = this.add.graphics();
    this.#ghost = this.add.graphics();

    this.#computeLayout(this.scale.width, this.scale.height);
    this.#redraw();
    this.#options.onStateChange(this.#state);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.#onPointerDown(pointer.x, pointer.y);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.#onPointerMove(pointer.x, pointer.y);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      this.#onPointerUp(pointer.x, pointer.y);
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.#handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.#handleResize);
    });
  }

  /** Called by the mechanic's own Restart button — see src/mechanic/index.ts. */
  restart(): void {
    this.#state = pixelDropEngine.create(this.#options.level);
    this.#completed = false;
    this.#drag = null;
    this.#redraw();
    this.#options.onStateChange(this.#state);
  }

  /**
   * Folds a restored autosave into the scene (docs/rules.md §9). No win
   * animation plays here — reopening an already-solved level should not
   * replay the reveal, just show it solved.
   */
  restore(saved: SavedPlacements): void {
    this.#state = restoreFromPlacements(this.#options.level, saved);
    this.#redraw();
    this.#options.onStateChange(this.#state);
    if (pixelDropEngine.isComplete(this.#state) && !this.#completed) {
      this.#completed = true;
      this.#options.onComplete();
    }
  }

  // --- Layout --------------------------------------------------------------

  #computeLayout(width: number, height: number): void {
    const { rows, cols, pieces } = this.#options.level;
    const traySlotUnits = Math.max(...pieces.map(pieceSpan)) + TRAY_SLOT_PADDING;
    const trayColumns = Math.max(1, Math.floor(cols / traySlotUnits));
    const trayRows = Math.ceil(pieces.length / trayColumns);

    const totalRowUnits = rows * THUMB_SCALE + GAP_UNITS + rows + GAP_UNITS + trayRows * traySlotUnits;
    const cellSize = Math.max(MIN_CELL_SIZE, Math.min(width / cols, height / totalRowUnits));

    const contentHeight = cellSize * totalRowUnits;
    const offsetY = (height - contentHeight) / 2;

    const thumbWidth = cols * cellSize * THUMB_SCALE;
    const thumbHeight = rows * cellSize * THUMB_SCALE;
    const thumbX = (width - thumbWidth) / 2;
    const thumbY = offsetY;

    const boardWidth = cols * cellSize;
    const boardHeight = rows * cellSize;
    const boardX = (width - boardWidth) / 2;
    const boardY = thumbY + thumbHeight + GAP_UNITS * cellSize;

    const traySlotSize = traySlotUnits * cellSize;
    const trayWidth = trayColumns * traySlotSize;
    const trayX = boardX + (boardWidth - trayWidth) / 2;
    const trayY = boardY + boardHeight + GAP_UNITS * cellSize;

    this.#layout = {
      cellSize,
      thumbX,
      thumbY,
      thumbCellSize: cellSize * THUMB_SCALE,
      boardX,
      boardY,
      trayX,
      trayY,
      traySlotSize,
      trayColumns,
    };
  }

  /** Where offset [0, 0] of `piece` would need to render for its anchor to land at (anchorRow, anchorCol) on the board. */
  #boardOrigin(layout: Layout, anchorRow: number, anchorCol: number): Point {
    return { x: layout.boardX + anchorCol * layout.cellSize, y: layout.boardY + anchorRow * layout.cellSize };
  }

  /** Same, but centring the piece's own bounding box inside its tray slot. */
  #trayOrigin(layout: Layout, piece: Piece, slotIndex: number): Point {
    const bounds = pieceBounds(piece);
    const col = slotIndex % layout.trayColumns;
    const row = Math.floor(slotIndex / layout.trayColumns);
    const slotCenterX = layout.trayX + col * layout.traySlotSize + layout.traySlotSize / 2;
    const slotCenterY = layout.trayY + row * layout.traySlotSize + layout.traySlotSize / 2;

    const bboxWidth = (bounds.maxCol - bounds.minCol + 1) * layout.cellSize;
    const bboxHeight = (bounds.maxRow - bounds.minRow + 1) * layout.cellSize;
    const bboxLeft = slotCenterX - bboxWidth / 2;
    const bboxTop = slotCenterY - bboxHeight / 2;

    return { x: bboxLeft - bounds.minCol * layout.cellSize, y: bboxTop - bounds.minRow * layout.cellSize };
  }

  /** Pieces currently in the tray, in level order — the same order used to assign slots. */
  #unplacedPieces(): Piece[] {
    return this.#options.level.pieces.filter((p) => this.#state.placements[p.id] === null);
  }

  #pieceAt(row: number, col: number): Piece | null {
    for (const piece of this.#options.level.pieces) {
      const placement = this.#state.placements[piece.id];
      if (placement === undefined || placement === null) continue;
      const hit = piece.cells.some((c) => placement.row + c.offset[0] === row && placement.col + c.offset[1] === col);
      if (hit) return piece;
    }
    return null;
  }

  // --- Input -----------------------------------------------------------------

  #zoneAt(layout: Layout, point: Point): Zone {
    const { rows, cols } = this.#options.level;
    if (point.y >= layout.trayY) return 'tray';
    if (
      point.x >= layout.boardX &&
      point.x < layout.boardX + cols * layout.cellSize &&
      point.y >= layout.boardY &&
      point.y < layout.boardY + rows * layout.cellSize
    ) {
      return 'board';
    }
    return 'none';
  }

  #cellUnder(layout: Layout, point: Point): { row: number; col: number } {
    return {
      row: Math.floor((point.y - layout.boardY) / layout.cellSize),
      col: Math.floor((point.x - layout.boardX) / layout.cellSize),
    };
  }

  #lifted(x: number, y: number): Point {
    return { x, y: y - LIFT_PX };
  }

  #onPointerDown(x: number, y: number): void {
    if (this.#completed) return;
    const layout = this.#layout;
    if (layout === null) return;

    const zone = this.#zoneAt(layout, { x, y });
    if (zone === 'board') {
      const { row, col } = this.#cellUnder(layout, { x, y });
      const piece = this.#pieceAt(row, col);
      if (piece === null) return;
      const placement = this.#state.placements[piece.id];
      if (placement === undefined || placement === null) return;
      this.#drag = {
        pieceId: piece.id,
        grabOffsetRow: row - placement.row,
        grabOffsetCol: col - placement.col,
        point: this.#lifted(x, y),
      };
      this.#redraw();
      return;
    }

    if (zone === 'tray') {
      const unplaced = this.#unplacedPieces();
      const slotIndex = this.#traySlotAt(layout, { x, y });
      const piece = slotIndex === null ? undefined : unplaced[slotIndex];
      if (piece === undefined) return;
      this.#drag = { pieceId: piece.id, grabOffsetRow: 0, grabOffsetCol: 0, point: this.#lifted(x, y) };
      this.#redraw();
    }
  }

  #traySlotAt(layout: Layout, point: Point): number | null {
    if (point.x < layout.trayX || point.y < layout.trayY) return null;
    const col = Math.floor((point.x - layout.trayX) / layout.traySlotSize);
    const row = Math.floor((point.y - layout.trayY) / layout.traySlotSize);
    if (col < 0 || col >= layout.trayColumns) return null;
    return row * layout.trayColumns + col;
  }

  #onPointerMove(x: number, y: number): void {
    if (this.#drag === null) return;
    this.#drag = { ...this.#drag, point: this.#lifted(x, y) };
    this.#redraw();
  }

  #onPointerUp(x: number, y: number): void {
    const drag = this.#drag;
    if (drag === null) return;
    this.#drag = null;

    const layout = this.#layout;
    if (layout === null) {
      this.#redraw();
      return;
    }

    const point = this.#lifted(x, y);
    const zone = this.#zoneAt(layout, point);

    if (zone === 'tray') {
      this.#commit({ type: 'unplace', pieceId: drag.pieceId });
      return;
    }

    if (zone === 'board') {
      const cell = this.#cellUnder(layout, point);
      this.#commit({
        type: 'place',
        pieceId: drag.pieceId,
        anchorRow: cell.row - drag.grabOffsetRow,
        anchorCol: cell.col - drag.grabOffsetCol,
      });
      return;
    }

    // Released nowhere meaningful: cancel, the piece stays where it was —
    // docs/rules.md §3 "Перетаскивание" rule 6.
    this.#redraw();
  }

  #commit(input: Parameters<typeof pixelDropEngine.apply>[1]): void {
    const before = this.#state;
    const after = pixelDropEngine.apply(before, input);
    this.#state = after;
    this.#redraw();

    if (after === before) return; // rejected placement — the piece simply stays put, no further effect.

    this.#options.onStateChange(this.#state);
    this.#vibrate(10);

    if (pixelDropEngine.isComplete(this.#state) && !this.#completed) {
      this.#completed = true;
      this.#playWinAnimation();
    }
  }

  #vibrate(pattern: number | number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Not every environment implements the Vibration API — never fatal.
    }
  }

  // --- Drawing -----------------------------------------------------------------

  #redraw(): void {
    const layout = this.#layout;
    if (layout === null) return;

    this.#drawThumbnail(layout);
    this.#drawBoard(layout);
    this.#drawTray(layout);
    this.#drawGhost(layout);
  }

  #drawThumbnail(layout: Layout): void {
    this.#thumb.clear();
    const theme = this.#options.theme;
    const size = layout.thumbCellSize;
    const pad = size * CELL_PADDING_RATIO;

    this.#state.targetGrid.forEach((row, r) => {
      row.forEach((cell, c) => {
        const x = layout.thumbX + c * size;
        const y = layout.thumbY + r * size;
        if (cell === null) {
          this.#thumb.lineStyle(1, theme.cellBorder, 0.5);
          this.#thumb.strokeRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
          return;
        }
        this.#thumb.fillStyle(theme.colors[cell.color], 1);
        this.#thumb.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
        this.#drawIcon(this.#thumb, cell.color, x + size / 2, y + size / 2, size * ICON_RATIO);
      });
    });
  }

  #drawBoard(layout: Layout): void {
    this.#board.clear();
    const theme = this.#options.theme;
    const pad = layout.cellSize * CELL_PADDING_RATIO;
    const draggedPieceId = this.#drag?.pieceId ?? null;

    for (let row = 0; row < this.#options.level.rows; row += 1) {
      for (let col = 0; col < this.#options.level.cols; col += 1) {
        const x = layout.boardX + col * layout.cellSize;
        const y = layout.boardY + row * layout.cellSize;
        this.#board.fillStyle(theme.cellEmpty, 1);
        this.#board.fillRect(x + pad, y + pad, layout.cellSize - pad * 2, layout.cellSize - pad * 2);
        this.#board.lineStyle(1, theme.cellBorder, 1);
        this.#board.strokeRect(x + pad, y + pad, layout.cellSize - pad * 2, layout.cellSize - pad * 2);
      }
    }

    for (const piece of this.#options.level.pieces) {
      if (piece.id === draggedPieceId) continue; // drawn as the ghost instead
      const placement = this.#state.placements[piece.id];
      if (placement === undefined || placement === null) continue;
      const origin = this.#boardOrigin(layout, placement.row, placement.col);
      this.#drawPiece(this.#board, piece, origin, layout.cellSize, 1);
    }
  }

  #drawTray(layout: Layout): void {
    this.#tray.clear();
    const theme = this.#options.theme;
    const draggedPieceId = this.#drag?.pieceId ?? null;

    for (let i = 0; i < layout.trayColumns * Math.ceil(this.#options.level.pieces.length / layout.trayColumns); i += 1) {
      const col = i % layout.trayColumns;
      const row = Math.floor(i / layout.trayColumns);
      const x = layout.trayX + col * layout.traySlotSize;
      const y = layout.trayY + row * layout.traySlotSize;
      this.#tray.lineStyle(1, theme.cellBorder, 0.6);
      this.#tray.strokeRect(x + 3, y + 3, layout.traySlotSize - 6, layout.traySlotSize - 6);
    }

    this.#unplacedPieces().forEach((piece, index) => {
      if (piece.id === draggedPieceId) return;
      const origin = this.#trayOrigin(layout, piece, index);
      this.#drawPiece(this.#tray, piece, origin, layout.cellSize, 1);
    });
  }

  #drawGhost(layout: Layout): void {
    this.#ghost.clear();
    const drag = this.#drag;
    if (drag === null) return;
    const piece = this.#options.level.pieces.find((p) => p.id === drag.pieceId);
    if (piece === undefined) return;

    const zone = this.#zoneAt(layout, drag.point);
    let origin: Point;

    if (zone === 'board') {
      const cell = this.#cellUnder(layout, drag.point);
      const anchorRow = cell.row - drag.grabOffsetRow;
      const anchorCol = cell.col - drag.grabOffsetCol;
      origin = this.#boardOrigin(layout, anchorRow, anchorCol);
      const valid = isValidPlacement(
        this.#options.level.rows,
        this.#options.level.cols,
        this.#options.level.pieces,
        this.#state.placements,
        piece.id,
        anchorRow,
        anchorCol,
      );
      this.#drawPiece(this.#ghost, piece, origin, layout.cellSize, 1, valid ? this.#options.theme.ok : this.#options.theme.error);
    } else {
      // Following the pointer freely (over the tray or nowhere in particular).
      const bounds = pieceBounds(piece);
      origin = {
        x: drag.point.x - ((bounds.minCol + bounds.maxCol + 1) / 2) * layout.cellSize,
        y: drag.point.y - ((bounds.minRow + bounds.maxRow + 1) / 2) * layout.cellSize,
      };
      const alpha = zone === 'tray' ? 0.85 : 0.6;
      this.#drawPiece(this.#ghost, piece, origin, layout.cellSize, alpha);
    }
  }

  #drawPiece(
    g: Phaser.GameObjects.Graphics,
    piece: Piece,
    origin: Point,
    cellSize: number,
    alpha: number,
    tint?: number,
  ): void {
    const theme = this.#options.theme;
    const pad = cellSize * CELL_PADDING_RATIO;

    for (const cell of piece.cells) {
      const x = origin.x + cell.offset[1] * cellSize;
      const y = origin.y + cell.offset[0] * cellSize;
      g.fillStyle(tint ?? theme.colors[cell.color], alpha);
      g.fillRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);
      if (tint === undefined) {
        this.#drawIcon(g, cell.color, x + cellSize / 2, y + cellSize / 2, cellSize * ICON_RATIO);
      }
    }
  }

  /** docs/rules.md §8: every colour carries a shape too, for players who cannot rely on colour alone. */
  #drawIcon(g: Phaser.GameObjects.Graphics, color: ColorId, cx: number, cy: number, r: number): void {
    const theme = this.#options.theme;
    g.fillStyle(theme.background, 0.9);

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
        return;
      case 'orange':
        g.fillPoints(starPoints(cx, cy, r, r * 0.42, 5), true);
        return;
      case 'pink':
        g.fillPoints(polygonPoints(cx, cy, r, 6), true);
    }
  }

  /** Rule "проявляются волной от центра" — nearer cells pop first. */
  #playWinAnimation(): void {
    const layout = this.#layout;
    if (layout === null) {
      this.#options.onComplete();
      return;
    }

    const { rows, cols } = this.#options.level;
    const boardCenterX = layout.boardX + (cols * layout.cellSize) / 2;
    const boardCenterY = layout.boardY + (rows * layout.cellSize) / 2;
    let maxDelay = 0;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (this.#state.grid[row]?.[col] === null || this.#state.grid[row]?.[col] === undefined) continue;

        const x = layout.boardX + col * layout.cellSize + layout.cellSize / 2;
        const y = layout.boardY + row * layout.cellSize + layout.cellSize / 2;
        const distance = Phaser.Math.Distance.Between(x, y, boardCenterX, boardCenterY);
        const delay = Math.min(400, distance * 4);
        maxDelay = Math.max(maxDelay, delay);

        const pop = this.add.circle(x, y, layout.cellSize * 0.1, this.#options.theme.ok, 0);
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

    this.#vibrate([10, 40, 10, 40, 20]);
    this.time.delayedCall(maxDelay + 250, this.#options.onComplete);
  }
}

function starPoints(cx: number, cy: number, outerR: number, innerR: number, spikes: number): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  const step = Math.PI / spikes;
  let angle = -Math.PI / 2;
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outerR : innerR;
    points.push(new Phaser.Math.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
    angle += step;
  }
  return points;
}

function polygonPoints(cx: number, cy: number, r: number, sides: number): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  const step = (Math.PI * 2) / sides;
  let angle = -Math.PI / 2;
  for (let i = 0; i < sides; i += 1) {
    points.push(new Phaser.Math.Vector2(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r));
    angle += step;
  }
  return points;
}
