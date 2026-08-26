import type { GameDefinition } from '../game.config.ts';
import type { LevelSession, MechanicHost } from '../shell-contract.ts';
import {
  allLevelsCompleted,
  needsOnboarding,
  nextLevelIndex,
  withLevelCompleted,
  withMoreAsked,
  withOnboardingSeen,
  type ProgressRepository,
  type ProgressState,
} from './progress/ProgressRepository.ts';
import type { Screen } from './Screen.ts';
import { GameScreen } from './screens/GameScreen.ts';
import { LevelSelect } from './screens/LevelSelect.ts';
import { MainMenu } from './screens/MainMenu.ts';
import { MoreScreen } from './screens/MoreScreen.ts';
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
        // Always the menu, even when the rules were opened as the first-run
        // gate on the way to the levels. Sending back "forward" past a gate the
        // player never acknowledged is not what a back button means — and the
        // onboarding version stays unsaved, so they would be shown it again
        // anyway. Reaching the levels is what "Понятно, играем" is for.
        this.goMenu();
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

  async #levelCompleted(levelIndex: number, screen: ReturnType<typeof GameScreen>): Promise<void> {
    this.#state = withLevelCompleted(this.#state, levelIndex);
    await this.#deps.progress.save(this.#state);

    const { game } = this.#deps;
    const { levelCount } = game;
    const finishedEverything = allLevelsCompleted(this.#state, levelCount) && !this.#state.moreAsked;

    if (finishedEverything) {
      screen.showOverlay(
        MoreScreen({
          onYes: () => {
            void this.#answerMore(true);
          },
          onNo: () => {
            void this.#answerMore(false);
          },
        }),
      );
      return;
    }

    const next = nextLevelIndex(levelIndex, levelCount);

    screen.showOverlay(
      Popup({
        testId: 'win-popup',
        emoji: '🎉',
        title: 'Поздравляю, прошёл!',
        body: `Уровень ${String(levelIndex + 1)} из ${String(levelCount)} — ${game.title}`,
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
            text: 'Ещё раз',
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

  async #answerMore(wantsMore: boolean): Promise<void> {
    this.#state = withMoreAsked(this.#state);
    await this.#deps.progress.save(this.#state);

    if (wantsMore) {
      // Deliberately not awaited. SignalSink promises to resolve even when
      // delivery fails, so awaiting it can only ever delay the screen — by up
      // to the sink's timeout on a bad connection, during which the button the
      // player just tapped looks dead. The signal is a data point; the player's
      // next screen is the product.
      void this.#deps.signal.send({ event: 'more_yes', gameId: this.#deps.game.id });
    }

    this.goLevelSelect();
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
