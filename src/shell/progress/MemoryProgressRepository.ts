import {
  emptyProgress,
  type ProgressRepository,
  type ProgressState,
} from './ProgressRepository.ts';

/** In-memory implementation for unit tests and for local experiments. */
export class MemoryProgressRepository implements ProgressRepository {
  #state: ProgressState;

  constructor(initial: ProgressState = emptyProgress()) {
    this.#state = initial;
  }

  load(): Promise<ProgressState> {
    return Promise.resolve(this.#state);
  }

  save(state: ProgressState): Promise<void> {
    this.#state = state;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.#state = emptyProgress();
    return Promise.resolve();
  }
}
