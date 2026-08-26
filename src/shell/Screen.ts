/**
 * A screen is a detached DOM subtree plus its teardown.
 *
 * Screens never navigate by themselves — they call back into ShellApp. That
 * keeps the whole flow of the application readable in one file.
 */
export interface Screen {
  readonly element: HTMLElement;
  /** Called when the screen leaves the DOM. Must release listeners and timers. */
  destroy(): void;
}

export function staticScreen(element: HTMLElement): Screen {
  return { element, destroy: () => undefined };
}
