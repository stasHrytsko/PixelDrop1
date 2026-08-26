/**
 * The one thing the shell reports back to us: "this game was worth more".
 *
 * The shell must never learn how that is delivered. Swapping ntfy for PostHog,
 * Firebase or a private endpoint has to be a one-line change in src/main.ts.
 */

export interface GameSignal {
  readonly event: 'more_yes';
  /** GameDefinition.id — never anything derived from the player. */
  readonly gameId: string;
}

export interface SignalSink {
  /**
   * Deliver the signal. Implementations must resolve even on failure: a lost
   * signal is a lost data point, not a reason to break the player's game.
   */
  send(signal: GameSignal): Promise<void>;
}

/** For tests, local development, and any build that must stay silent. */
export class NoopSignalSink implements SignalSink {
  readonly sent: GameSignal[] = [];

  send(signal: GameSignal): Promise<void> {
    this.sent.push(signal);
    return Promise.resolve();
  }
}
