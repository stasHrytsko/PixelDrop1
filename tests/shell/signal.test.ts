import { describe, expect, it, vi } from 'vitest';
import { NtfySignalSink } from '../../src/shell/signal/NtfySignalSink.ts';
import { NoopSignalSink } from '../../src/shell/signal/SignalSink.ts';

const VALID_TOPIC = 'g7Kq2_bV9x-Lm4Rt8Zc1';

function okFetch(): typeof globalThis.fetch {
  return vi.fn(() => Promise.resolve(new Response('', { status: 200 })));
}

describe('NtfySignalSink', () => {
  it('refuses a topic short enough to be guessed', () => {
    expect(() => new NtfySignalSink('short')).toThrow(/Invalid ntfy topic/);
  });

  it('refuses a topic with characters ntfy does not accept', () => {
    expect(() => new NtfySignalSink('has spaces and slashes/x'.padEnd(20, 'x'))).toThrow(
      /Invalid ntfy topic/,
    );
  });

  it('posts the game id and event to the topic URL', async () => {
    const fetchMock = okFetch();
    await new NtfySignalSink(VALID_TOPIC, fetchMock).send({ event: 'more_yes', gameId: 'demo' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchMock).mock.calls[0] ?? [];
    expect(url).toBe(`https://ntfy.sh/${VALID_TOPIC}`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('game=demo event=more_yes');
  });

  it('carries nothing beyond the game id and the event', async () => {
    const fetchMock = okFetch();
    await new NtfySignalSink(VALID_TOPIC, fetchMock).send({ event: 'more_yes', gameId: 'demo' });

    const body = vi.mocked(fetchMock).mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe('string');
    expect((body as string).split(' ')).toHaveLength(2);
  });

  it('resolves quietly when the network is gone', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof globalThis.fetch;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      new NtfySignalSink(VALID_TOPIC, failing).send({ event: 'more_yes', gameId: 'demo' }),
    ).resolves.toBeUndefined();
  });

  it('resolves quietly when ntfy answers with an error status', async () => {
    const failing = vi.fn(() =>
      Promise.resolve(new Response('nope', { status: 500 })),
    ) as unknown as typeof globalThis.fetch;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      new NtfySignalSink(VALID_TOPIC, failing).send({ event: 'more_yes', gameId: 'demo' }),
    ).resolves.toBeUndefined();
  });
});

describe('NoopSignalSink', () => {
  it('records without sending', async () => {
    const sink = new NoopSignalSink();
    await sink.send({ event: 'more_yes', gameId: 'demo' });
    expect(sink.sent).toEqual([{ event: 'more_yes', gameId: 'demo' }]);
  });
});
