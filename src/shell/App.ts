import type { GameDefinition } from '../game.config.ts';
import type { LevelSession, MechanicHost } from '../shell-contract.ts';
import {
  needsOnboarding,
  nextLevelIndex,
  withLevelCompleted,
  withOnboardingSeen,
  type ProgressRepository,
  type ProgressState,
} from './progress/ProgressRepository.ts';
import type { Screen } from './Screen.ts';
import { GameScreen } from './screens/GameScreen.ts';
import { LevelSelect } from './screens/LevelSelect.ts';
import { MainMenu } from './screens/MainMenu.ts';
import { Onboarding } from './screens/Onboarding.ts';
import { Popup } from './screens/Popup.ts';
import type { SignalSink } from './signal/SignalSink.ts';

export interface ShellAppDeps {
  root: HTMLElement;
  game: GameDefinition;
  progress: ProgressRepository;
  signal: SignalSink;
  mechanic: MechanicHost;
}

type Route = 'menu' | 'rules' | 'levels' | 'game';

/**
 * The whole navigation of the application, in one readable file.
 *
 * Screens never navigate themselves and the mechanic never navigates at all —
 * it reports `onComplete` / `onExit` and this class decides what that means.
 */
export class ShellApp {
  readonly #deps: ShellAppDeps;

  #state: ProgressState;
  #screen: Screen | null = null;
  #session: LevelSession | null = null;
  #route: Route = 'menu';
  /** Where "Как играть" should return to when it was opened from the menu. */
  #rulesReturn: Route = 'menu';

  constructor(deps: ShellAppDeps, initialState: ProgressState) {
    this.#deps = deps;
    this.#state = initialState;
  }

  static async create(deps: ShellAppDeps): Promise<ShellApp> {
    const initialState = await deps.progress.load();
    return new ShellApp(deps, initialState);
  }

  start(): void {
    this.goMenu();
  }

  get route(): Route {
    return this.#route;
  }

  // --- Navigation ---------------------------------------------------------

  goMenu(): void {
    this.#route = 'menu';
    this.#show(
      MainMenu(this.#deps.game, {
        onPlay: () => {
          this.#playPressed();
        },
        onShowRules: () => {
          this.#rulesReturn = 'menu';
          this.goRules();
        },
      }),
    );
  }

  goRules(): void {
    this.#route = 'rules';
    this.#show(
      Onboarding(this.#deps.game, () => {
        void this.#rulesAcknowledged();
      }),
    );
  }

  goLevelSelect(): void {
    this.#route = 'levels';
    this.#show(
      LevelSelect(this.#deps.game, this.#state, {
        onSelect: (levelIndex) => {
          this.goLevel(levelIndex);
        },
        onBack: () => {
          this.goMenu();
        },
      }),
    );
  }

  goLevel(levelIndex: number): void {
    this.#route = 'game';

    const screen = GameScreen(levelIndex, {
      onBack: () => {
        this.goLevelSelect();
      },
    });
    screen.setStats(`Уровень ${String(levelIndex + 1)} из ${String(this.#deps.game.levelCount)}`);
    this.#show(screen);

    // A session that has already been torn down must not be able to complete.
    let live = true;
    const session = this.#deps.mechanic.createLevel({
      container: screen.surface,
      levelIndex,
      onComplete: () => {
        if (!live) return;
        live = false;
        void this.#levelCompleted(levelIndex, screen);
      },
      onExit: () => {
        if (!live) return;
        live = false;
        this.goLevelSelect();
      },
    });

    this.#session = {
      destroy: () => {
        live = false;
        session.destroy();
      },
    };
  }

  /**
   * Android hardware back. Returns false when there is nothing left to go back
   * to, which main.ts translates into "let the OS close the app".
   */
  handleBack(): boolean {
    switch (this.#route) {
      case 'menu':
        return false;
      case 'rules':
        if (this.#rulesReturn === 'menu') this.goMenu();
        else this.goLevelSelect();
        return true;
      case 'levels':
        this.goMenu();
        return true;
      case 'game':
        this.goLevelSelect();
        return true;
    }
  }

  // --- Flow ---------------------------------------------------------------

  #playPressed(): void {
    if (needsOnboarding(this.#state, this.#deps.game.onboarding.version)) {
      this.#rulesReturn = 'levels';
      this.goRules();
      return;
    }
    this.goLevelSelect();
  }

  async #rulesAcknowledged(): Promise<void> {
    this.#state = withOnboardingSeen(this.#state, this.#deps.game.onboarding.version);
    await this.#deps.progress.save(this.#state);

    if (this.#rulesReturn === 'menu') this.goMenu();
    else this.goLevelSelect();
  }

  /**
   * docs/rules.md §7: v2 always shows the same win popup — "Сыграть снова",
   * plus "Следующий уровень" once there is one. There is no "Ещё?" ask after
   * the last level (that was v1's ntfy-signal flow); SignalSink stays wired
   * in ShellAppDeps for other games, this one just never calls it.
   */
  async #levelCompleted(levelIndex: number, screen: ReturnType<typeof GameScreen>): Promise<void> {
    this.#state = withLevelCompleted(this.#state, levelIndex);
    await this.#deps.progress.save(this.#state);

    const { game } = this.#deps;
    const next = nextLevelIndex(levelIndex, game.levelCount);

    screen.showOverlay(
      Popup({
        testId: 'win-popup',
        emoji: '🎉',
        title: 'Рисунок собран!',
        body: `Уровень ${String(levelIndex + 1)} из ${String(game.levelCount)} — ${game.title}`,
        actions: [
          ...(next === null
            ? []
            : [
                {
                  text: `Уровень ${String(next + 1)} →`,
                  variant: 'primary' as const,
                  testId: 'next-level',
                  onClick: (): void => {
                    this.goLevel(next);
                  },
                },
              ]),
          {
            text: 'Сыграть снова',
            variant: next === null ? ('primary' as const) : undefined,
            testId: 'replay-level',
            onClick: (): void => {
              this.goLevel(levelIndex);
            },
          },
          {
            text: 'К уровням',
            variant: 'ghost' as const,
            testId: 'to-levels',
            onClick: (): void => {
              this.goLevelSelect();
            },
          },
        ],
      }),
    );
  }

  // --- Screen plumbing ----------------------------------------------------

  #show(screen: Screen): void {
    this.#session?.destroy();
    this.#session = null;

    this.#screen?.destroy();
    this.#screen = screen;

    this.#deps.root.replaceChildren(screen.element);
  }
}
