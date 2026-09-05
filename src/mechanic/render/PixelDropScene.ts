import Phaser from 'phaser';
import { isValidPlacement, pixelDropEngine, restoreFromPlacements } from '../engine/pixelDropEngine.ts';
import type { ColorId, LevelConfig, LevelState, Piece } from '../engine/types.ts';
import type { SavedPlacements } from '../save/SaveRepository.ts';
import type { SceneTheme } from './theme.ts';

/** Thumbnail cell size, relative to a board cell — docs/rules.md §7. */
const THUMB_SCALE = 0.42;
/** Vertical gap between the thumbnail/board/tray cards, in cell units. */
const GAP_UNITS = 0.5;
/** Padding inside a card, in cell units, on every side. */
const CARD_PADDING_UNITS = 0.4;
/** Row reserved for the board card's "СОБЕРИ РИСУНОК" header. */
const HEADER_UNITS = 0.6;
/** Row reserved for the "можно переставлять сколько угодно" hint under the board. */
const HINT_UNITS = 0.55;
/** Row reserved for the "Твои фигуры" header above the tray. */
const TRAY_HEADER_UNITS = 0.6;
/** Row reserved for the "ОБРАЗЕЦ" caption under the thumbnail. */
const THUMB_LABEL_UNITS = 0.45;
/** Extra room around a piece's own bounding box inside its tray slot. */
const TRAY_SLOT_PADDING = 0.5;
const MIN_CELL_SIZE = 26;
const OUTER_MARGIN_PX = 16;
/** Visual-only vertical offset so a dragged piece is not hidden under a finger. */
const LIFT_PX = 34;

const CELL_PADDING_RATIO = 0.08;
const ICON_RATIO = 0.3;

export interface PixelDropSceneOptions {
  level: LevelConfig;
  theme: SceneTheme;
  onComplete: () => void;
  onStateChange: (state: LevelState) => void;
}

interface Layout {
  cellSize: number;

  thumbCardX: number;
  thumbCardY: number;
  thumbCardW: number;
  thumbCardH: number;
  thumbX: number;
  thumbY: number;
  thumbCellSize: number;
  thumbLabelY: number;

  boardCardX: number;
  boardCardY: number;
  boardCardW: number;
  boardCardH: number;
  boardHeaderY: number;
  boardX: number;
  boardY: number;
  boardHintY: number;

  trayHeaderY: number;
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
 *
 * Every tray piece keeps a fixed slot for the whole level (its index in
 * level.pieces), whether placed or not — a placed slot just shows a
 * checkmark instead of shifting the rest of the tray around.
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
  #texts: Phaser.GameObjects.Text[] = [];

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

    const widthCellSize = (width - OUTER_MARGIN_PX * 2) / (cols + CARD_PADDING_UNITS * 2);
    const totalRowUnits =
      CARD_PADDING_UNITS * 2 + rows * THUMB_SCALE + THUMB_LABEL_UNITS +
      GAP_UNITS +
      CARD_PADDING_UNITS * 2 + HEADER_UNITS + rows + HINT_UNITS +
      GAP_UNITS +
      TRAY_HEADER_UNITS + trayRows * traySlotUnits;
    const cellSize = Math.max(MIN_CELL_SIZE, Math.min(widthCellSize, height / totalRowUnits));

    const contentHeight = cellSize * totalRowUnits;
    let cursorY = Math.max(0, (height - contentHeight) / 2);

    const thumbCellSize = cellSize * THUMB_SCALE;
    const thumbGridW = cols * thumbCellSize;
    const thumbGridH = rows * thumbCellSize;
    const thumbCardW = thumbGridW + cellSize * CARD_PADDING_UNITS * 2;
    const thumbCardH = cellSize * CARD_PADDING_UNITS * 2 + thumbGridH + cellSize * THUMB_LABEL_UNITS;
    const thumbCardX = (width - thumbCardW) / 2;
    const thumbCardY = cursorY;
    const thumbX = thumbCardX + cellSize * CARD_PADDING_UNITS;
    const thumbY = thumbCardY + cellSize * CARD_PADDING_UNITS;
    const thumbLabelY = thumbY + thumbGridH + (cellSize * THUMB_LABEL_UNITS) / 2;
    cursorY += thumbCardH + GAP_UNITS * cellSize;

    const boardCardW = cols * cellSize + cellSize * CARD_PADDING_UNITS * 2;
    const boardCardH = cellSize * (CARD_PADDING_UNITS * 2 + HEADER_UNITS + rows + HINT_UNITS);
    const boardCardX = (width - boardCardW) / 2;
    const boardCardY = cursorY;
    const boardHeaderY = boardCardY + cellSize * CARD_PADDING_UNITS + (cellSize * HEADER_UNITS) / 2;
    const boardX = boardCardX + cellSize * CARD_PADDING_UNITS;
    const boardY = boardCardY + cellSize * (CARD_PADDING_UNITS + HEADER_UNITS);
    const boardHintY = boardY + rows * cellSize + (cellSize * HINT_UNITS) / 2;
    cursorY += boardCardH + GAP_UNITS * cellSize;

    const trayHeaderY = cursorY + (cellSize * TRAY_HEADER_UNITS) / 2;
    cursorY += TRAY_HEADER_UNITS * cellSize;
    const traySlotSize = traySlotUnits * cellSize;
    const trayWidth = trayColumns * traySlotSize;
    const trayX = boardCardX + (boardCardW - trayWidth) / 2;
    const trayY = cursorY;

    this.#layout = {
      cellSize,
      thumbCardX,
      thumbCardY,
      thumbCardW,
      thumbCardH,
      thumbX,
      thumbY,
      thumbCellSize,
      thumbLabelY,
      boardCardX,
      boardCardY,
      boardCardW,
      boardCardH,
      boardHeaderY,
      boardX,
      boardY,
      boardHintY,
      trayHeaderY,
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

  /** Same, but centring the piece's own bounding box inside its (fixed) tray slot. */
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

  #slotCenter(layout: Layout, slotIndex: number): Point {
    const col = slotIndex % layout.trayColumns;
    const row = Math.floor(slotIndex / layout.trayColumns);
    return {
      x: layout.trayX + col * layout.traySlotSize + layout.traySlotSize / 2,
      y: layout.trayY + row * layout.traySlotSize + layout.traySlotSize / 2,
    };
  }

  #unplacedCount(): number {
    return this.#options.level.pieces.filter((p) => this.#state.placements[p.id] === null).length;
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
      const slotIndex = this.#traySlotAt(layout, { x, y });
      const piece = slotIndex === null ? undefined : this.#options.level.pieces[slotIndex];
      if (piece === undefined) return;
      // A slot showing a checkmark is grabbed from the board instead, not from here.
      if (this.#state.placements[piece.id] !== null) return;
      this.#drag = { pieceId: piece.id, grabOffsetRow: 0, grabOffsetCol: 0, point: this.#lifted(x, y) };
      this.#redraw();
    }
  }

  #traySlotAt(layout: Layout, point: Point): number | null {
    if (point.x < layout.trayX || point.y < layout.trayY) return null;
    const col = Math.floor((point.x - layout.trayX) / layout.traySlotSize);
    const row = Math.floor((point.y - layout.trayY) / layout.traySlotSize);
    if (col < 0 || col >= layout.trayColumns) return null;
    const index = row * layout.trayColumns + col;
    return index < this.#options.level.pieces.length ? index : null;
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

    for (const text of this.#texts) text.destroy();
    this.#texts = [];

    this.#drawThumbnail(layout);
    this.#drawBoard(layout);
    this.#drawTray(layout);
    this.#drawGhost(layout);
  }

  /** A white rounded card with a faint drop shadow, the one visual unit the whole screen is built from. */
  #drawCard(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, radius: number): void {
    const theme = this.#options.theme;
    g.fillStyle(0x1f2333, 0.06);
    g.fillRoundedRect(x, y + 2, w, h, radius);
    g.fillStyle(theme.card, 1);
    g.fillRoundedRect(x, y, w, h, radius);
    g.lineStyle(1, theme.cardBorder, 1);
    g.strokeRoundedRect(x, y, w, h, radius);
  }

  #addText(
    text: string,
    x: number,
    y: number,
    color: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    align: 'left' | 'center' | 'right' = 'left',
  ): Phaser.GameObjects.Text {
    const node = this.add.text(x, y, text, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: this.#colorToCss(color),
      ...style,
    });
    node.setOrigin(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
    this.#texts.push(node);
    return node;
  }

  #drawThumbnail(layout: Layout): void {
    this.#thumb.clear();
    const theme = this.#options.theme;
    const radius = Math.min(18, layout.cellSize * 0.3);
    this.#drawCard(this.#thumb, layout.thumbCardX, layout.thumbCardY, layout.thumbCardW, layout.thumbCardH, radius);

    const size = layout.thumbCellSize;
    const pad = size * 0.06;
    const cellRadius = Math.min(4, size * 0.25);
    this.#state.targetGrid.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell === null) return;
        const x = layout.thumbX + c * size;
        const y = layout.thumbY + r * size;
        this.#thumb.fillStyle(theme.colors[cell.color], 1);
        this.#thumb.fillRoundedRect(x + pad, y + pad, size - pad * 2, size - pad * 2, cellRadius);
        this.#drawIcon(this.#thumb, cell.color, x + size / 2, y + size / 2, size * ICON_RATIO);
      });
    });

    this.#addText(
      'ОБРАЗЕЦ',
      layout.thumbCardX + layout.thumbCardW / 2,
      layout.thumbLabelY,
      theme.textMuted,
      { fontSize: '11px', fontStyle: '700' },
      'center',
    );
  }

  #drawBoard(layout: Layout): void {
    this.#board.clear();
    const theme = this.#options.theme;
    const { rows, cols } = this.#options.level;
    const radius = Math.min(20, layout.cellSize * 0.3);
    this.#drawCard(this.#board, layout.boardCardX, layout.boardCardY, layout.boardCardW, layout.boardCardH, radius);

    const placedCount = Object.values(this.#state.placements).filter((p) => p !== null).length;
    this.#addText('СОБЕРИ РИСУНОК', layout.boardX, layout.boardHeaderY, theme.textMuted, { fontSize: '12px', fontStyle: '700' }, 'left');
    this.#addText(
      `${String(placedCount)} / ${String(this.#options.level.pieces.length)} фигур`,
      layout.boardX + cols * layout.cellSize,
      layout.boardHeaderY,
      theme.textMuted,
      { fontSize: '13px' },
      'right',
    );

    const pad = layout.cellSize * CELL_PADDING_RATIO;
    const cellRadius = Math.min(6, layout.cellSize * 0.18);
    const draggedPieceId = this.#drag?.pieceId ?? null;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = layout.boardX + col * layout.cellSize;
        const y = layout.boardY + row * layout.cellSize;
        this.#board.fillStyle(theme.cellEmpty, 1);
        this.#board.fillRoundedRect(x + pad, y + pad, layout.cellSize - pad * 2, layout.cellSize - pad * 2, cellRadius);
      }
    }

    for (const piece of this.#options.level.pieces) {
      if (piece.id === draggedPieceId) continue; // drawn as the ghost instead
      const placement = this.#state.placements[piece.id];
      if (placement === undefined || placement === null) continue;
      const origin = this.#boardOrigin(layout, placement.row, placement.col);
      this.#drawPiece(this.#board, piece, origin, layout.cellSize, 1);
    }

    this.#board.fillStyle(theme.ok, 1);
    this.#board.fillCircle(layout.boardX + 4, layout.boardHintY, 3);
    this.#addText(
      'Можно переставлять сколько угодно',
      layout.boardX + 12,
      layout.boardHintY,
      theme.textMuted,
      { fontSize: '12px' },
      'left',
    );
  }

  #drawTray(layout: Layout): void {
    this.#tray.clear();
    const theme = this.#options.theme;
    const draggedPieceId = this.#drag?.pieceId ?? null;
    // Left-aligned with the board grid above, same as its own header row.
    // There is no second, right-aligned hint on this row — on a phone-width
    // screen "Твои фигуры N" and a second hint do not both fit legibly, and
    // the "?" button already carries the full instructions.
    const headerLeftX = layout.boardX;

    const label = this.#addText('Твои фигуры', headerLeftX, layout.trayHeaderY, theme.text, { fontSize: '16px', fontStyle: '700' }, 'left');
    const badgeCx = headerLeftX + label.width + 18;
    this.#tray.fillStyle(theme.cellEmpty, 1);
    this.#tray.fillCircle(badgeCx, layout.trayHeaderY, 11);
    this.#addText(String(this.#unplacedCount()), badgeCx, layout.trayHeaderY, theme.text, { fontSize: '12px', fontStyle: '700' }, 'center');

    const radius = Math.min(14, layout.cellSize * 0.25);
    this.#options.level.pieces.forEach((piece, index) => {
      const col = index % layout.trayColumns;
      const row = Math.floor(index / layout.trayColumns);
      const x = layout.trayX + col * layout.traySlotSize;
      const y = layout.trayY + row * layout.traySlotSize;
      const inset = layout.traySlotSize * 0.06;
      this.#drawCard(this.#tray, x + inset, y + inset, layout.traySlotSize - inset * 2, layout.traySlotSize - inset * 2, radius);

      const placed = this.#state.placements[piece.id] !== null && this.#state.placements[piece.id] !== undefined;
      if (placed) {
        const center = this.#slotCenter(layout, index);
        this.#drawCheck(this.#tray, center.x, center.y, layout.cellSize * 0.32, theme.ok);
        return;
      }
      if (piece.id === draggedPieceId) return; // drawn as the ghost instead
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
    const cellRadius = Math.min(6, cellSize * 0.18);

    for (const cell of piece.cells) {
      const x = origin.x + cell.offset[1] * cellSize;
      const y = origin.y + cell.offset[0] * cellSize;
      g.fillStyle(tint ?? theme.colors[cell.color], alpha);
      g.fillRoundedRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, cellRadius);
      if (tint === undefined) {
        this.#drawIcon(g, cell.color, x + cellSize / 2, y + cellSize / 2, cellSize * ICON_RATIO);
      }
    }
  }

  /** docs/rules.md §8: every colour carries a shape too, for players who cannot rely on colour alone. */
  #drawIcon(g: Phaser.GameObjects.Graphics, color: ColorId, cx: number, cy: number, r: number): void {
    const theme = this.#options.theme;
    g.fillStyle(theme.text, 0.85);

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

  #drawCheck(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number): void {
    g.lineStyle(Math.max(2, r * 0.26), color, 1);
    g.beginPath();
    g.moveTo(cx - r * 0.55, cy);
    g.lineTo(cx - r * 0.1, cy + r * 0.5);
    g.lineTo(cx + r * 0.6, cy - r * 0.55);
    g.strokePath();
  }

  #colorToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
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
