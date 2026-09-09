import { pixelDropEngine } from '../engine/pixelDropEngine.ts';
import type { GameInput, LevelConfig, LevelState } from '../engine/types.ts';
import { PixelDropInputController } from '../input/PixelDropInputController.ts';
import { PixelDropView } from '../render/PixelDropView.ts';

export interface PixelDropGameOptions {
  readonly level: LevelConfig;
  readonly onComplete: () => void;
}

const WIN_ANIMATION_MS = 560;

export class PixelDropGame {
  readonly #options: PixelDropGameOptions;
  readonly #view: PixelDropView;
  readonly #input: PixelDropInputController;
  #state: LevelState;
  #completionTimer: number | null = null;
  #completionReported = false;
  #destroyed = false;

  constructor(options: PixelDropGameOptions) {
    this.#options = options;
    this.#state = pixelDropEngine.create(options.level);
    this.#view = new PixelDropView(options.level);
    this.#input = new PixelDropInputController(this.#view, {
      getState: () => this.#state,
      onSelectPiece: (pieceId) => this.#apply({ type: 'select_piece', pieceId }),
      onClearSelection: () => this.#apply({ type: 'clear_selection' }),
      onPlacePiece: (pieceId, row, col) => this.#placePiece(pieceId, row, col),
      onRestart: () => this.restart(),
    });
  }

  mount(container: HTMLElement): void {
    this.#view.mount(container);
    this.#view.render(this.#state);
    this.#input.attach();
  }

  restart(): void {
    this.#cancelCompletion();
    this.#completionReported = false;
    this.#state = pixelDropEngine.create(this.#options.level);
    this.#view.render(this.#state);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancelCompletion();
    this.#input.destroy();
    this.#view.destroy();
  }

  #apply(input: GameInput): void {
    const next = pixelDropEngine.apply(this.#state, input);
    if (next === this.#state) return;
    this.#state = next;
    this.#view.render(next);
  }

  #placePiece(pieceId: string, row: number, col: number): boolean {
    const next = pixelDropEngine.apply(this.#state, { type: 'place_piece', pieceId, row, col });
    if (next === this.#state) return false;

    this.#state = next;
    this.#view.render(next);
    if (next.gameState === 'won') this.#scheduleCompletion();
    return true;
  }

  #scheduleCompletion(): void {
    if (this.#completionReported || this.#destroyed) return;
    this.#completionReported = true;
    this.#completionTimer = window.setTimeout(() => {
      this.#completionTimer = null;
      if (!this.#destroyed) this.#options.onComplete();
    }, WIN_ANIMATION_MS);
  }

  #cancelCompletion(): void {
    if (this.#completionTimer !== null) window.clearTimeout(this.#completionTimer);
    this.#completionTimer = null;
  }
}
