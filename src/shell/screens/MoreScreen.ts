import { Popup } from './Popup.ts';

export interface MoreScreenHandlers {
  /** The player wants more. This is the only event the game ever reports back. */
  onYes: () => void;
  /** "Нет" or dismissal. Deliberately sends nothing at all. */
  onNo: () => void;
}

/**
 * Shown once, after the final level. The entire product question of the MVP
 * lives in this popup: was this game worth building more of?
 */
export function MoreScreen(handlers: MoreScreenHandlers): HTMLElement {
  return Popup({
    testId: 'more-popup',
    emoji: '🏆',
    title: 'Все уровни пройдены!',
    body: 'Хочешь ещё уровней этой игры?',
    actions: [
      { text: 'Да, ещё!', variant: 'primary', testId: 'more-yes', onClick: handlers.onYes },
      { text: 'Нет, хватит', variant: 'ghost', testId: 'more-no', onClick: handlers.onNo },
    ],
  });
}
