/**
 * The single source of truth about *this* game.
 *
 * Everything the shell needs to render itself lives here, so that no value is
 * duplicated across LevelSelect, progress, the mechanic and the store listing.
 *
 * `npm run new-game` rewrites this file. The placeholder values below are
 * deliberately invalid for shipping — scripts/check-placeholders.ts fails the
 * build while they are still present.
 */

export interface GameDefinition {
  /** Stable slug, used as the progress storage key and in the signal payload. */
  id: string;
  /** Android application id. Must be unique on Google Play. */
  appId: string;
  /** Shown on the main menu and as the Android app label. */
  title: string;
  /** One line under the title on the main menu. */
  tagline: string;
  /** Content version of the game itself. Bump when levels change. */
  version: number;

  /** How many levels this game ships. The 3-wide grid adapts to the number. */
  levelCount: number;

  onboarding: {
    /** Bump this when the rules change — players will see the onboarding again. */
    version: number;
    title: string;
    /** Rule lines. Rendered as a list, one entry per rule. */
    rules: readonly string[];
  };

  signal: {
    /**
     * ntfy topic. Acts as a password: anyone who knows it can publish AND
     * subscribe. Generate it long and random, and never put player data in a
     * message. See docs/architecture.md §7.2.
     */
    topic: string;
  };
}

/**
 * Which template revision this game was created from. When a shell fix lands in
 * game-template, this field tells you which games are worth updating by hand —
 * the template is copied, not inherited.
 *
 * Still 0.9.0: the automated pipeline is green end to end, but the manual pass
 * on an emulator and a physical phone (docs/architecture.md §10) has not been
 * done. Browser tests do not prove an Android build works. Bump to 1.0.0 only
 * after that checklist is ticked off on a real device.
 */
export const TEMPLATE_VERSION = '0.9.0';

export const GAME: GameDefinition = {
  id: 'game-template',
  appId: 'com.example.gametemplate',
  title: 'Game Template',
  tagline: 'Заглушка механики: собери все круги',
  version: 1,

  levelCount: 9,

  onboarding: {
    version: 1,
    title: 'Как играть',
    rules: [
      'Нажимай на круги на поле',
      'Собери все круги, чтобы пройти уровень',
      'С каждым уровнем кругов больше',
      'Уровни открываются по порядку',
    ],
  },

  signal: {
    topic: 'REPLACE_ME_WITH_A_RANDOM_TOPIC',
  },
};
