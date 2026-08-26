import './styles/tokens.css';
import './styles/shell.css';

import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

import { GAME } from './game.config.ts';
import { createMechanicHost } from './mechanic/index.ts';
import { ShellApp } from './shell/App.ts';
import { PreferencesProgressRepository } from './shell/progress/PreferencesProgressRepository.ts';
import { NtfySignalSink } from './shell/signal/NtfySignalSink.ts';
import { NoopSignalSink, type SignalSink } from './shell/signal/SignalSink.ts';

/**
 * Composition root.
 *
 * This is the only file that knows both halves of the application exist, and
 * the only place where an implementation is chosen for an interface. Swapping
 * ntfy for something else, or Preferences for a server, is a change here and
 * nowhere else.
 */

function createSignalSink(): SignalSink {
  try {
    return new NtfySignalSink(GAME.signal.topic);
  } catch (error) {
    // A misconfigured topic must not stop anyone from playing.
    console.warn('[signal] disabled:', error);
    return new NoopSignalSink();
  }
}

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (root === null) {
    throw new Error('Missing #app element in index.html.');
  }

  document.title = GAME.title;

  const app = await ShellApp.create({
    root,
    game: GAME,
    progress: new PreferencesProgressRepository(GAME.id),
    signal: createSignalSink(),
    mechanic: createMechanicHost(),
  });

  app.start();

  if (Capacitor.isNativePlatform()) {
    // Android hardware back. Without this the button closes the app from any
    // screen, which is the single most common "it works in Chrome" bug.
    void CapacitorApp.addListener('backButton', () => {
      if (!app.handleBack()) {
        void CapacitorApp.exitApp();
      }
    });
  }
}

void boot();
