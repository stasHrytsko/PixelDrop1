import { pixelDropEngine } from '../engine/pixelDropEngine.ts';
import { createLevelSnapshot, restoreLevelSnapshot } from '../engine/snapshot.ts';
import type { GameInput, LevelConfig, LevelState } from '../engine/types.ts';
import { PixelDropInputController } from '../input/PixelDropInputController.ts';
import { PixelDropView } from '../render/PixelDropView.ts';

export interface PixelDropGameOptions {
  readonly level: LevelConfig;
  readonly onComplete: () => void;
  readonly resumeState?: unknown;
  readonly onStateChange?: (snapshot: unknown) => void;
}

const WIN_ANIMATION_MS = 560;

export class PixelDropGame {
  readonly #options: PixelDropGameOptions;
  readonly #view: PixelDropView;
  readonly #input: PixelDropInputController;
  #state: LevelState;
  #completionTimer: number | null = null;
  #phaseTimer: number | null = null;
  #completionReported = false;
  #destroyed = false;
  #reveal: { mount(container: HTMLElement): void; destroy(): void } | null = null;

  constructor(options: PixelDropGameOptions) {
    this.#options = options;
    this.#state = restoreLevelSnapshot(options.level, options.resumeState) ?? pixelDropEngine.create(options.level);
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
    this.#reportState(this.#state.gameState === 'won');
    if (this.#state.gameState === 'phase_complete') this.#schedulePhaseAdvance();
    if (this.#state.gameState === 'won') this.#scheduleCompletion();
  }

  restart(): void {
    this.#cancelPhaseAdvance();
    const restarted = pixelDropEngine.apply(this.#state, { type: 'restart_phase' });
    if (restarted === this.#state) return;
    this.#state = restarted;
    this.#view.render(this.#state);
    this.#reportState();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancelCompletion();
    this.#cancelPhaseAdvance();
    this.#input.destroy();
    this.#reveal?.destroy();
    this.#reveal = null;
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
    this.#reportState(next.gameState === 'won');
    if (next.gameState === 'phase_complete') this.#schedulePhaseAdvance();
    if (next.gameState === 'won') this.#scheduleCompletion();
    return true;
  }

  #schedulePhaseAdvance(): void {
    if (this.#phaseTimer !== null || this.#destroyed) return;
    this.#phaseTimer = window.setTimeout(() => {
      this.#phaseTimer = null;
      if (this.#destroyed) return;
      const next = pixelDropEngine.apply(this.#state, { type: 'advance_phase' });
      if (next === this.#state) return;
      this.#state = next;
      this.#view.render(next);
      this.#reportState();
    }, WIN_ANIMATION_MS);
  }

  #scheduleCompletion(): void {
    if (this.#completionTimer !== null || this.#completionReported || this.#destroyed) return;
    this.#completionTimer = window.setTimeout(() => {
      this.#completionTimer = null;
      if (!this.#destroyed) void this.#showReveal();
    }, WIN_ANIMATION_MS);
  }

  async #showReveal(): Promise<void> {
    if (this.#destroyed || this.#completionReported) return;
    if (this.#options.level.object === null) {
      this.#complete();
      return;
    }
    this.#input.destroy();
    const { VoxelReveal } = await import('../render/VoxelReveal.ts');
    if (this.#destroyed || this.#completionReported) return;
    this.#reveal = new VoxelReveal(this.#options.level.object, () => this.#complete());
    this.#reveal.mount(this.#view.element);
  }

  #complete(): void {
    if (this.#completionReported || this.#destroyed) return;
    this.#completionReported = true;
    this.#options.onComplete();
  }

  #reportState(revealPending = false): void {
    this.#options.onStateChange?.(createLevelSnapshot(this.#options.level, this.#state, revealPending));
  }

  #cancelCompletion(): void {
    if (this.#completionTimer !== null) window.clearTimeout(this.#completionTimer);
    this.#completionTimer = null;
  }

  #cancelPhaseAdvance(): void {
    if (this.#phaseTimer !== null) window.clearTimeout(this.#phaseTimer);
    this.#phaseTimer = null;
  }
}
