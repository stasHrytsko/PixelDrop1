import { button, el } from '../dom.ts';
import type { Screen } from '../Screen.ts';

export interface GameScreenHandlers {
  onBack: () => void;
}

export interface GameScreen extends Screen {
  /** The element handed to the mechanic. The shell never draws inside it. */
  readonly surface: HTMLElement;
  setStats(text: string): void;
  showOverlay(overlay: HTMLElement): void;
  hideOverlay(): void;
}

export function GameScreen(levelIndex: number, handlers: GameScreenHandlers): GameScreen {
  const stats = el('span', { className: 'game-header__stats', testId: 'game-stats' });
  const surface = el('div', { className: 'game-surface', testId: 'game-surface' });

  const element = el('section', { className: 'screen screen--game', testId: 'game-screen' }, [
    el('header', { className: 'game-header' }, [
      button({
        text: `← УР. ${String(levelIndex + 1)}`,
        variant: 'ghost',
        block: false,
        className: 'game-header__back',
        testId: 'game-back',
        onClick: handlers.onBack,
      }),
      stats,
    ]),
    surface,
  ]);

  let overlay: HTMLElement | null = null;

  return {
    element,
    surface,
    setStats(text: string): void {
      stats.textContent = text;
    },
    showOverlay(next: HTMLElement): void {
      overlay?.remove();
      overlay = next;
      element.append(next);
    },
    hideOverlay(): void {
      overlay?.remove();
      overlay = null;
    },
    destroy(): void {
      overlay?.remove();
      overlay = null;
    },
  };
}
