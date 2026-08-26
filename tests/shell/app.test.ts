import { beforeEach, describe, expect, it } from 'vitest';
import type { GameDefinition } from '../../src/game.config.ts';
import type { CreateLevelParams, LevelSession, MechanicHost } from '../../src/shell-contract.ts';
import { ShellApp } from '../../src/shell/App.ts';
import { MemoryProgressRepository } from '../../src/shell/progress/MemoryProgressRepository.ts';
import {
  emptyProgress,
  withOnboardingSeen,
  type ProgressState,
} from '../../src/shell/progress/ProgressRepository.ts';
import { NoopSignalSink, type SignalSink } from '../../src/shell/signal/SignalSink.ts';

const GAME: GameDefinition = {
  id: 'test-game',
  appId: 'com.example.testgame',
  title: 'Test Game',
  tagline: 'A game used only by the shell tests',
  version: 1,
  levelCount: 3,
  onboarding: { version: 2, title: 'Как играть', rules: ['Правило один', 'Правило два'] },
  signal: { topic: 'testTopic_0123456789' },
};

/**
 * Stands in for the real mechanic so the shell flow can be tested without a
 * renderer. This is exactly what the Shell/Mechanic split is for.
 */
class FakeMechanic implements MechanicHost {
  mounted: CreateLevelParams | null = null;
  destroyed = 0;

  createLevel(params: CreateLevelParams): LevelSession {
    this.mounted = params;
    return {
      destroy: () => {
        this.destroyed += 1;
      },
    };
  }

  finishLevel(): void {
    this.mounted?.onComplete();
  }

  exitLevel(): void {
    this.mounted?.onExit();
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let root: HTMLElement;
let mechanic: FakeMechanic;
let signal: NoopSignalSink;
let progress: MemoryProgressRepository;

function find(testId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-testid="' + testId + '"]');
}

function click(testId: string): void {
  const node = find(testId);
  if (node === null) throw new Error('No element with data-testid=' + testId);
  node.click();
}

async function launch(initial: ProgressState = emptyProgress()): Promise<ShellApp> {
  progress = new MemoryProgressRepository(initial);
  const app = await ShellApp.create({ root, game: GAME, progress, signal, mechanic });
  app.start();
  return app;
}

/** Same, with a substitute sink — for asserting how the shell treats delivery. */
async function launchWith(sink: SignalSink): Promise<ShellApp> {
  progress = new MemoryProgressRepository(withOnboardingSeen(emptyProgress(), 2));
  const app = await ShellApp.create({ root, game: GAME, progress, signal: sink, mechanic });
  app.start();
  return app;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector<HTMLElement>('#app') as HTMLElement;
  mechanic = new FakeMechanic();
  signal = new NoopSignalSink();
});

describe('first launch', () => {
  it('opens on the main menu', async () => {
    await launch();
    expect(find('main-menu')).not.toBeNull();
    expect(find('game-title')?.textContent).toBe('Test Game');
  });

  it('shows the onboarding before the levels', async () => {
    await launch();
    click('play');
    expect(find('onboarding')).not.toBeNull();
    expect(root.querySelectorAll('.rules__item')).toHaveLength(2);

    click('onboarding-continue');
    await flush();
    expect(find('level-select')).not.toBeNull();
  });

  it('remembers that the onboarding was seen', async () => {
    await launch();
    click('play');
    click('onboarding-continue');
    await flush();

    expect((await progress.load()).onboardingVersion).toBe(2);
  });
});

describe('returning player', () => {
  it('skips onboarding when the stored version is current', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');
    expect(find('level-select')).not.toBeNull();
  });

  it('shows onboarding again when the rules moved ahead', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 1));
    click('play');
    expect(find('onboarding')).not.toBeNull();
  });

  it('can open the rules from the menu without starting a game', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('show-rules');
    expect(find('onboarding')).not.toBeNull();

    click('onboarding-continue');
    await flush();
    expect(find('main-menu')).not.toBeNull();
  });
});

describe('level select', () => {
  it('locks every level but the first on a fresh install', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');

    expect(find('level-1')?.dataset['state']).toBe('unlocked');
    expect(find('level-2')?.dataset['state']).toBe('locked');
    expect((find('level-2') as HTMLButtonElement).disabled).toBe(true);
  });

  it('colours the grid by difficulty band', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');

    expect(find('level-1')?.dataset['band']).toBe('easy');
    expect(find('level-2')?.dataset['band']).toBe('medium');
    expect(find('level-3')?.dataset['band']).toBe('hard');
  });
});

describe('playing a level', () => {
  async function startLevelOne(): Promise<ShellApp> {
    const app = await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');
    click('level-1');
    return app;
  }

  it('mounts the mechanic into the game surface', async () => {
    await startLevelOne();
    expect(find('game-screen')).not.toBeNull();
    expect(mechanic.mounted?.levelIndex).toBe(0);
    expect(mechanic.mounted?.container).toBe(find('game-surface'));
  });

  it('shows the win popup and saves progress on completion', async () => {
    await startLevelOne();
    mechanic.finishLevel();
    await flush();

    expect(find('win-popup')).not.toBeNull();
    expect(find('next-level')?.textContent).toBe('Уровень 2 →');
    expect((await progress.load()).completedLevels).toEqual([0]);
  });

  it('moves on to the next level from the popup', async () => {
    await startLevelOne();
    mechanic.finishLevel();
    await flush();
    click('next-level');

    expect(mechanic.mounted?.levelIndex).toBe(1);
  });

  it('replays the same level from the popup', async () => {
    await startLevelOne();
    mechanic.finishLevel();
    await flush();
    click('replay-level');

    expect(mechanic.mounted?.levelIndex).toBe(0);
  });

  it('destroys the session when the screen changes', async () => {
    await startLevelOne();
    click('game-back');
    expect(mechanic.destroyed).toBe(1);
    expect(find('level-select')).not.toBeNull();
  });

  it('honours onExit from inside the mechanic', async () => {
    await startLevelOne();
    mechanic.exitLevel();
    expect(find('level-select')).not.toBeNull();
  });

  it('ignores a completion that arrives after the session was torn down', async () => {
    await startLevelOne();
    const stale = mechanic.mounted;
    click('game-back');

    stale?.onComplete();
    await flush();
    expect(find('win-popup')).toBeNull();
    expect((await progress.load()).completedLevels).toEqual([]);
  });
});

describe('finishing the game', () => {
  async function finishEveryLevel(): Promise<void> {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');
    click('level-1');

    for (let level = 0; level < GAME.levelCount; level += 1) {
      mechanic.finishLevel();
      await flush();
      if (level < GAME.levelCount - 1) click('next-level');
    }
  }

  it('asks for more instead of the usual win popup', async () => {
    await finishEveryLevel();
    expect(find('more-popup')).not.toBeNull();
    expect(find('win-popup')).toBeNull();
  });

  it('sends exactly one signal when the player says yes', async () => {
    await finishEveryLevel();
    click('more-yes');
    await flush();

    expect(signal.sent).toEqual([{ event: 'more_yes', gameId: 'test-game' }]);
    expect((await progress.load()).moreAsked).toBe(true);
  });

  it('sends nothing at all when the player says no', async () => {
    await finishEveryLevel();
    click('more-no');
    await flush();

    expect(signal.sent).toEqual([]);
    expect((await progress.load()).moreAsked).toBe(true);
  });

  it('leaves the popup immediately, without waiting for the signal', async () => {
    // NtfySignalSink allows itself 8 seconds before giving up. Awaiting it here
    // left the player looking at a button that had visibly done nothing.
    let settle: (() => void) | null = null;
    const stalled: SignalSink = {
      send: () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    };

    await launchWith(stalled);
    click('play');
    click('level-1');
    for (let level = 0; level < GAME.levelCount; level += 1) {
      mechanic.finishLevel();
      await flush();
      if (level < GAME.levelCount - 1) click('next-level');
    }

    click('more-yes');
    await flush();

    expect(settle).not.toBeNull();  // the send did start
    expect(find('level-select')).not.toBeNull();
    expect(find('more-popup')).toBeNull();
    expect((await progress.load()).moreAsked).toBe(true);
  });

  it('never asks a second time', async () => {
    await finishEveryLevel();
    click('more-no');
    await flush();

    click('level-3');
    mechanic.finishLevel();
    await flush();

    expect(find('more-popup')).toBeNull();
    expect(find('win-popup')).not.toBeNull();
  });
});

describe('android hardware back', () => {
  it('walks back up the flow and then gives up to the OS', async () => {
    const app = await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');
    click('level-1');

    expect(app.handleBack()).toBe(true);
    expect(find('level-select')).not.toBeNull();

    expect(app.handleBack()).toBe(true);
    expect(find('main-menu')).not.toBeNull();

    expect(app.handleBack()).toBe(false);
  });

  it('returns to the menu from the rules opened on the menu', async () => {
    const app = await launch(withOnboardingSeen(emptyProgress(), 2));
    click('show-rules');
    expect(app.handleBack()).toBe(true);
    expect(find('main-menu')).not.toBeNull();
  });

  it('returns to the menu from the first-run onboarding, not past it', async () => {
    // Back must not walk *forward* through a gate the player never accepted.
    // It used to land on the level grid with onboardingVersion still unsaved.
    const app = await launch();
    click('play');
    expect(find('onboarding')).not.toBeNull();

    expect(app.handleBack()).toBe(true);
    expect(find('main-menu')).not.toBeNull();
    expect(find('level-select')).toBeNull();
    expect((await progress.load()).onboardingVersion).toBe(0);

    // And the gate still holds on the next attempt.
    click('play');
    expect(find('onboarding')).not.toBeNull();
  });
});
