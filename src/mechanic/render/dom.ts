export function createDiv(className: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  return element;
}

export function createButton(className: string, testId: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.dataset['testid'] = testId;
  return element;
}
