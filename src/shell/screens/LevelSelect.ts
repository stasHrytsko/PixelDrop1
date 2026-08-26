import type { GameDefinition } from '../../game.config.ts';
import { BAND_LABEL, difficultyBand, type DifficultyBand } from '../difficulty.ts';
import { button, el } from '../dom.ts';
import {
  isLevelCompleted,
  isLevelUnlocked,
  type ProgressState,
} from '../progress/ProgressRepository.ts';
import { staticScreen, type Screen } from '../Screen.ts';

export interface LevelSelectHandlers {
  onSelect: (levelIndex: number) => void;
  onBack: () => void;
}

function legendEntry(band: DifficultyBand): HTMLElement {
  const dot = el('span', { className: 'legend__dot' });
  dot.style.background = `var(--${band})`;
  return el('span', {}, [dot, el('span', { text: BAND_LABEL[band] })]);
}

export function LevelSelect(
  game: GameDefinition,
  progress: ProgressState,
  handlers: LevelSelectHandlers,
): Screen {
  const cells: HTMLElement[] = [];

  for (let index = 0; index < game.levelCount; index += 1) {
    const unlocked = isLevelUnlocked(progress, index);
    const completed = isLevelCompleted(progress, index);
    const state = completed ? 'completed' : unlocked ? 'unlocked' : 'locked';

    const cell = el(
      'button',
      {
        className: 'level-cell',
        testId: `level-${String(index + 1)}`,
        attrs: {
          type: 'button',
          'data-band': difficultyBand(index, game.levelCount),
          'data-state': state,
          'aria-label': `Уровень ${String(index + 1)}, ${
            completed ? 'пройден' : unlocked ? 'доступен' : 'закрыт'
          }`,
        },
      },
      [
        el('span', { text: unlocked ? String(index + 1) : '🔒' }),
        completed ? el('span', { className: 'level-cell__badge', text: '✓' }) : null,
      ],
    );

    if (unlocked) {
      cell.addEventListener('click', () => {
        handlers.onSelect(index);
      });
    } else {
      cell.disabled = true;
    }

    cells.push(cell);
  }

  const screen = el('section', { className: 'screen', testId: 'level-select' }, [
    el('h2', { className: 'section-title', text: 'Выбери уровень' }),
    el('div', { className: 'level-grid' }, cells),
    el('div', { className: 'legend' }, [
      legendEntry('easy'),
      legendEntry('medium'),
      legendEntry('hard'),
    ]),
    el('div', { className: 'screen__spacer' }),
    button({ text: '← Назад', variant: 'ghost', testId: 'levels-back', onClick: handlers.onBack }),
  ]);

  return staticScreen(screen);
}
