import type { GameDefinition } from '../../game.config.ts';
import { button, el } from '../dom.ts';
import { staticScreen, type Screen } from '../Screen.ts';

export interface MainMenuHandlers {
  onPlay: () => void;
  onShowRules: () => void;
}

export function MainMenu(game: GameDefinition, handlers: MainMenuHandlers): Screen {
  const screen = el('section', { className: 'screen', testId: 'main-menu' }, [
    el('div', {}, [
      el('h1', { className: 'title', text: game.title, testId: 'game-title' }),
      el('p', { className: 'tagline', text: game.tagline }),
    ]),
    el('div', { className: 'screen__spacer' }),
    el('div', { className: 'popup__actions' }, [
      button({ text: 'Выбрать уровень', variant: 'primary', testId: 'play', onClick: handlers.onPlay }),
      button({ text: 'Как играть', variant: 'ghost', testId: 'show-rules', onClick: handlers.onShowRules }),
    ]),
  ]);

  return staticScreen(screen);
}
