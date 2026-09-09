import type { ColorId, Piece } from '../engine/types.ts';
import { createDiv } from './dom.ts';

export const PIECE_SYMBOLS: Readonly<Record<ColorId, string>> = {
  coral: '◆',
  rose: '●',
  purple: '▲',
};

const COLOR_NAMES: Readonly<Record<ColorId, string>> = {
  coral: 'оранжевый',
  rose: 'розовый',
  purple: 'фиолетовый',
};

export function pieceAriaLabel(piece: Piece): string {
  return 'Фигура ' + piece.label + ', ' + piece.cells.map((cell) => COLOR_NAMES[cell.color]).join(', ');
}

export function createPieceGraphic(piece: Piece, cellSize: number): HTMLElement {
  const shape = createDiv('pixel-drop-piece-shape');
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
    symbol.textContent = PIECE_SYMBOLS[pieceCell.color];
    pixel.append(symbol);
    shape.append(pixel);
  }

  return shape;
}
