import { button, el, type ButtonOptions } from '../dom.ts';

export interface PopupAction extends Omit<ButtonOptions, 'block'> {
  text: string;
}

export interface PopupOptions {
  testId: string;
  emoji: string;
  title: string;
  body?: string;
  actions: readonly PopupAction[];
}

/**
 * The one popup shape in the shell.
 *
 * Today it backs the win popup and the "Ещё?" prompt. A loss popup — which the
 * current Shell/Mechanic contract has no way to trigger, see docs/decisions.md
 * D-007 — would be built from exactly this function and nothing else.
 */
export function Popup(options: PopupOptions): HTMLElement {
  return el('div', { className: 'popup-overlay', testId: options.testId }, [
    el(
      'div',
      { className: 'popup', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      [
        el('div', { className: 'popup__emoji', text: options.emoji, attrs: { 'aria-hidden': 'true' } }),
        el('h3', { className: 'popup__title', text: options.title }),
        options.body === undefined ? null : el('p', { className: 'popup__body', text: options.body }),
        el(
          'div',
          { className: 'popup__actions' },
          options.actions.map((action) => button({ ...action, block: true })),
        ),
      ],
    ),
  ]);
}
