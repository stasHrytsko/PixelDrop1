# Pixel Drop

Мобильная puzzle-игра: игрок переставляет шесть цветных фигур на поле 10×10 и
воспроизводит рисунок-образец. Проект работает как веб-приложение, PWA-подобная
мобильная версия и Android-приложение через Capacitor.

## Архитектура игры

Игровая часть разделена по ответственности:

```text
src/mechanic/
├── engine/       чистые правила, состояние и проверка размещения
├── levels/       JSON-контент, схема, валидация и репозиторий уровней
├── render/       DOM-графика игрового поля и фигур
├── input/        pointer/touch/click → игровые намерения
├── application/ координация движка, ввода, графики и lifecycle
└── index.ts      точка сборки механики для shell
```

Направление зависимостей и правила добавления контента описаны в
[`docs/pixel-drop-architecture.md`](./docs/pixel-drop-architecture.md). Правила
игры находятся в [`docs/rules.md`](./docs/rules.md). Единая продуктовая и
техническая спецификация ведётся в [`tech document.md`](./tech%20document.md).

## Запуск

```bash
npm ci
npm run dev
```

## Проверка

```bash
npm run check
npm run verify-template
```

`npm run check` последовательно выполняет typecheck, ESLint, unit-тесты,
production build и Playwright E2E.

## Android

```bash
npm run cap:sync
npm run android:open
```

Подготовка локального Android toolchain описана в
[`docs/android-setup.md`](./docs/android-setup.md).

Общая DOM-оболочка (`src/shell/**`) отвечает за онбординг, выбор уровня,
прогресс и системную навигацию. Игровая механика подключается к ней только
через `src/shell-contract.ts`.
