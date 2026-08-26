import type { GameSignal, SignalSink } from './SignalSink.ts';

const NTFY_BASE = 'https://ntfy.sh';
const SEND_TIMEOUT_MS = 8_000;

/**
 * ntfy has no accounts, so the topic *is* the password: anyone who learns it
 * can publish to it and subscribe to it. Two consequences are baked in here:
 *
 *  - the topic must be long and random (validated below);
 *  - the payload carries the game id and the event, and nothing else. No player
 *    data ever goes over this channel.
 *
 * This is not secure analytics. A third party who guesses the topic can forge a
 * signal. For an MVP whose only question is "is this game worth continuing?",
 * that trade is acceptable and deliberate.
 */
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export class NtfySignalSink implements SignalSink {
  readonly #topic: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(topic: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)) {
    if (!TOPIC_PATTERN.test(topic)) {
      throw new Error(
        `Invalid ntfy topic ${JSON.stringify(topic)}: expected 16-64 chars of [A-Za-z0-9_-]. ` +
          'Run `npm run new-game` to generate one.',
      );
    }
    this.#topic = topic;
    this.#fetch = fetchImpl;
  }

  async send(signal: GameSignal): Promise<void> {
    const body = `game=${signal.gameId} event=${signal.event}`;

    try {
      // Deliberately a CORS "simple request": text/plain body and no custom
      // headers, so no preflight is issued. ntfy's Title/Tags/Priority headers
      // would look nicer on the phone and would force an OPTIONS round-trip
      // from both the browser and the Android WebView — one more thing to fail
      // for a payload that is already two words long.
      const response = await this.#fetch(`${NTFY_BASE}/${this.#topic}`, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'text/plain' },
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.warn(`[signal] ntfy responded ${String(response.status)}`);
      }
    } catch (error) {
      // Swallow: an unreachable network must never surface to the player.
      console.warn('[signal] delivery failed', error);
    }
  }
}
