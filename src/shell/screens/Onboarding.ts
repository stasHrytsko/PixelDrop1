import type { GameDefinition } from '../../game.config.ts';
import { button, el } from '../dom.ts';
import { staticScreen, type Screen } from '../Screen.ts';

/**
 * The rules screen. It is the single place the rules are written down, and it
 * is shown automatically whenever the stored onboarding version is behind
 * GameDefinition.onboarding.version — change the rules, bump the version, and
 * every returning player is re-taught.
 */
export function Onboarding(game: GameDefinition, onContinue: () => void): Screen {
  const items = game.onboarding.rules.map((rule, index) =>
    el('li', { className: 'rules__item' }, [
      el('span', { className: 'rules__marker', text: String(index + 1) }),
      el('span', { text: rule }),
    ]),
  );

  const screen = el('section', { className: 'screen', testId: 'onboarding' }, [
    el('h2', { className: 'section-title', text: game.onboarding.title }),
    el('ul', { className: 'rules' }, items),
    el('div', { className: 'screen__spacer' }),
    button({ text: 'Понятно, играем', variant: 'primary', testId: 'onboarding-continue', onClick: onContinue }),
  ]);

  return staticScreen(screen);
}
