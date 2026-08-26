/** Minimal typed DOM helpers. The shell is small enough not to need a framework. */

export interface ElementOptions {
  className?: string;
  text?: string;
  testId?: string;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly (Node | null)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.testId !== undefined) node.dataset['testid'] = options.testId;

  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(key, value);
  }

  for (const child of children) {
    if (child !== null) node.append(child);
  }

  return node;
}

export interface ButtonOptions extends ElementOptions {
  variant?: 'primary' | 'default' | 'ghost';
  block?: boolean;
  onClick: () => void;
}

export function button(options: ButtonOptions): HTMLButtonElement {
  const variantClass =
    options.variant === 'primary' ? ' btn--primary' : options.variant === 'ghost' ? ' btn--ghost' : '';
  const blockClass = options.block === false ? '' : ' btn--block';

  const node = el('button', {
    ...options,
    className: `btn${variantClass}${blockClass}${options.className ? ` ${options.className}` : ''}`,
    attrs: { type: 'button', ...options.attrs },
  });

  node.addEventListener('click', options.onClick);
  return node;
}
