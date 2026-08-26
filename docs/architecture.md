# Шаблон и пайплайн для Android-игр

*v0.3 — как построено. Основан на v0.2 (19 авг 2026); расхождения помечены и
разобраны в [decisions.md](./decisions.md).*

Цель: не начинать каждую игру с нуля. Один стартовый репозиторий-шаблон, где
вся «оболочка» уже готова и протестирована, а под каждую новую идею меняется
только модуль механики.

**Что изменилось против v0.2** (детали — в decisions.md):

| | Было в v0.2 | Стало | Почему |
|---|---|---|---|
| D-001 | TypeScript последней версии | TS 6.0.3 | на TS 7 не работает `lint` |
| D-002 | плагин `phaser4-gamedev` | официальные скиллы в `node_modules/phaser/skills/` | версионированы под установленный Phaser |
| D-003 | `android/` в репозитории | генерируется под каждую игру | appId зашит в путь Java-пакета |
| D-004 | `env(safe-area-inset-*)` | `var(--safe-area-inset-*, env(...))` | Capacitor инжектит свои переменные |
| D-006 | `onboarding.body: string` | `onboarding.rules: string[]` | правила — это список |
| D-007 | — | попапа поражения нет | контракт его не предусматривает |

---

## 0. Как работать с этим документом

Два отдельных шага, их не стоит смешивать.

**Шаг 1 — построить сам шаблон.** Сделан. Результат — этот репозиторий.

**Шаг 2 — под каждую новую игровую идею:**

1. «Use this template» → новый репозиторий.
2. `npm ci`
3. `npm run new-game -- --name "..." --id "com...."` (см. §9).
4. `npm run build && npx cap add android`
5. Положить концепт идеи как `docs/rules.md`.
6. Реализовать только `src/mechanic/**`, не трогая `src/shell/**`.

Идея строится один раз без шаблона — шаблон построен один раз без идеи.

---

## 1. Принцип разделения: Shell vs Mechanic

| Слой | Что внутри | Меняется между играми? |
|---|---|---|
| **Shell** | главный экран, онбординг, выбор уровней, попап «Ещё?», навигация, прогресс, отправка сигнала | Нет |
| **Mechanic** | правила, рендер поля, состояние уровня, обработка ввода, контент уровней | Да — это и есть новая игра |

Базовый принцип: **engine ничего не знает про UI**, а **shell ничего не знает
про правила игры и про ввод** — он оперирует только жизненным циклом уровня.

Это не соглашение, а проверяемое свойство. `eslint.config.js` запрещает:

- `src/mechanic/engine/**` → импорт Phaser, `@capacitor/*`, `render/`, `shell/`
  и обращение к `window`, `document`, `localStorage`, `fetch`;
- `src/shell/**` → импорт Phaser, импорт чего угодно из `mechanic/`,
  обращение к `localStorage`;
- `src/shell/screens/**` и `src/shell/progress/**` → обращение к `fetch`
  (единственное место в shell, которому `fetch` разрешён, — `signal/`).

Каждый из этих запретов закрыт **и на голом идентификаторе, и на свойстве**:
`no-restricted-globals` видит только `localStorage`, но не `window.localStorage`,
поэтому рядом стоит `no-restricted-syntax` (см. `bannedAsProperty`). Правило,
которое обходится приставкой `window.`, — не граница, а комментарий.

Плюс два независимых страховочных слоя: `vitest.config.ts` гоняет тесты механики
в окружении `node` **без DOM** — если чистая функция потянется к `document`,
тест упадёт, а не пройдёт молча; а `tests/tooling/lintRules.test.ts` прогоняет
сам ESLint по нарушающим фикстурам, потому что граница ровно настолько реальна,
насколько её отвергает линтер.

---

## 2. Стек

| Пакет | Версия | Роль |
|---|---|---|
| `phaser` | 4.2.1 | рендер и игровой цикл |
| `@capacitor/core` / `android` / `cli` | 8.5.0 | сборка в APK/AAB |
| `@capacitor/preferences` | 8.0.1 | хранение прогресса |
| `@capacitor/app` | 8.1.1 | аппаратная кнопка «назад» |
| `vite` | 8.2.2 | сборщик и dev-сервер |
| `vitest` | 4.1.11 | юнит-тесты |
| `@playwright/test` | 1.62.1 | E2E |
| `typescript` | 6.0.3 | strict |

Версии зафиксированы точно (без `^`), `package-lock.json` коммитится.

### Phaser 4

Причина выбрать Phaser вообще — огромный корпус кода и туториалов у модели. Но
корпус этот почти весь про Phaser 3, и на четвёрке модель ошибается чаще.

Страховка нашлась лучше ожидаемой: **Phaser 4.2.1 везёт официальные скиллы** в
`node_modules/phaser/skills/` — 28 директорий с `SKILL.md`, включая
`v3-to-v4-migration` и `v4-new-features`. Они версионированы вместе с самим
Phaser, чего сторонний плагин обеспечить не может. `CLAUDE.md` указывает
читать их вместо угадывания.

Ломающие изменения v4, которые важно знать: pipelines → render nodes, FX и
маски → filters, `Geom.Point` → `Vector2`, `Mesh`/`Plane` удалены. Ничего из
этого shell не касается — откат на Phaser 3 остаётся дешёвым.

### Слой интерфейса: DOM shell

Shell (`MainMenu`, `Onboarding`, `LevelSelect`, `GameScreen`, `MoreScreen`) —
HTML/CSS вокруг canvas. Phaser отвечает только за игру.

```
DOM shell → монтирует Phaser mechanic → mechanic сообщает complete → DOM shell показывает следующий экран
```

Почему так, а не rexUI внутри canvas: Playwright работает с настоящими
DOM-элементами по `data-testid`. UI внутри canvas — объекты, до которых
добираются координатами и скриншотами. Для агентного цикла проверки разница
огромная.

Честная цена, и как она оплачена:

- **safe areas** — §7.3 и D-004;
- **синхронизация ресайза** — `Phaser.Scale.RESIZE` с `width/height: '100%'`,
  сцена перекладывает объекты по событию `resize`;
- **z-index** — попапы позиционируются внутри `#app`, canvas лежит в
  `.game-surface` с `overflow: hidden`;
- **визуальная согласованность** — `src/styles/tokens.css` единственный
  источник цветов, `src/mechanic/render/theme.ts` читает их в рантайме и отдаёт
  сцене. Захардкоженного цвета в сцене нет.

### Ассеты

Пока никаких: shell собран на чистом CSS с токенами. Kenney UI Pack (CC0)
добавляется поверх без переделки — токены уже вынесены.

---

## 3. Структура репозитория

```
game-template/
├── CLAUDE.md                  # инструкции агенту. Единственный файл инструкций
├── package.json / package-lock.json
├── capacitor.config.ts
├── index.html
├── eslint.config.js           # здесь же — границы Shell/Mechanic
├── vite / vitest / playwright / tsconfig
│
├── docs/
│   ├── architecture.md        # этот документ
│   ├── decisions.md           # решения и их цена
│   └── rules.md               # правила ТЕКУЩЕЙ игры — переписывается
│
├── scripts/
│   ├── placeholders.ts        # список строк, которые обязаны быть заменены
│   ├── new-game.ts            # bootstrap: имя, appId, slug, ntfy-топик
│   └── check-placeholders.ts  # падает, если placeholder остался
│
├── src/
│   ├── main.ts                # composition root — единственное место сборки
│   ├── game.config.ts         # GameDefinition
│   ├── shell-contract.ts      # интерфейс Shell ↔ Mechanic
│   ├── styles/
│   │   ├── tokens.css         # единственный источник визуального языка
│   │   └── shell.css
│   │
│   ├── shell/                 # копируется в каждую игру
│   │   ├── App.ts             # весь роутинг приложения, один файл
│   │   ├── Screen.ts / dom.ts / difficulty.ts
│   │   ├── screens/           # MainMenu, Onboarding, LevelSelect,
│   │   │                      # GameScreen, Popup, MoreScreen
│   │   ├── progress/
│   │   │   ├── ProgressRepository.ts            # интерфейс + чистые правила
│   │   │   ├── PreferencesProgressRepository.ts # @capacitor/preferences
│   │   │   └── MemoryProgressRepository.ts      # для тестов
│   │   └── signal/
│   │       ├── SignalSink.ts                    # интерфейс + NoopSignalSink
│   │       └── NtfySignalSink.ts
│   │
│   └── mechanic/              # единственное, что переписывается
│       ├── index.ts           # createMechanicHost() — единственный экспорт
│       ├── engine/            # чистые функции. Ноль импортов UI и Phaser
│       ├── levels/            # versioned JSON + валидация при загрузке
│       └── render/            # Phaser-сцена, здесь же обработка ввода
│
├── tests/
│   ├── shell/                 # jsdom
│   ├── mechanic/              # node, без DOM
│   └── e2e/                   # Playwright
│
└── .github/workflows/ci.yml
```

---

## 4. Контракт Shell ↔ Mechanic

Shell не знает про ввод. Ему не важно, тапает пользователь по плитке, свайпает
или тянет линию — это дело mechanic. Shell знает только жизненный цикл уровня.

```typescript
// src/shell-contract.ts

export interface LevelSession {
  destroy(): void;                 // должен быть безопасен при повторном вызове
}

export interface CreateLevelParams {
  container: HTMLElement;          // механика владеет им на время сессии
  levelIndex: number;              // 0..levelCount-1
  onComplete: () => void;          // уровень решён, не более одного раза
  onExit: () => void;              // игрок вышел изнутри игрового поля
}

export interface MechanicHost {
  createLevel(params: CreateLevelParams): LevelSession;
}
```

Колбэки — свойства, а не методы (D-008). Поражения в контракте нет (D-007).

Внутри mechanic — строго типизированный engine:

```typescript
// src/mechanic/engine/types.ts

export interface MechanicEngine<TState, TInput, TLevel> {
  create(level: TLevel): TState;
  apply(state: TState, input: TInput): TState;
  isComplete(state: TState): boolean;
}
```

`TState`, `TInput`, `TLevel` определяются под конкретную игру. Ввод живёт между
`render` и `engine` внутри mechanic — граница с shell его не пересекает.

Каждая сессия получает собственный `Phaser.Game`, который уничтожается вместе с
ней. Пара миллисекунд на смене уровня в обмен на гарантию, что состояние не
протечёт из уровня в уровень.

---

## 5. GameDefinition

```typescript
// src/game.config.ts

export interface GameDefinition {
  id: string;                  // 'screw-mahjong' — ключ прогресса и id в сигнале
  appId: string;               // 'com.example.screwmahjong'
  title: string;
  tagline: string;             // одна строка под названием
  version: number;

  levelCount: number;          // 9 — формат зафиксирован, но число живёт здесь

  onboarding: {
    version: number;           // поднимается при изменении правил
    title: string;
    rules: readonly string[];  // 4-6 пунктов
  };

  signal: { topic: string };   // ntfy topic
}

export const TEMPLATE_VERSION = '0.9.0';
```

Про `levelCount`: формат «всегда 9» остаётся сознательным решением. Но число
лежит здесь не ради гибкости, а чтобы не оказаться продублированным в
LevelSelect, progress, mechanic и тестах одновременно. Сетка `3×N` и разбиение
на три полосы сложности считаются от него.

---

## 6. Поток экранов

```
Запуск
   ↓
Main Menu ──[Как играть]──► Onboarding ──► обратно в меню
   ↓  [Выбрать уровень]
Onboarding — если сохранённый onboardingVersion < текущего
   ↓
Level Select (levelCount ячеек, три полосы сложности, замки по порядку)
   ↓
Уровень ──onComplete──► попап победы: «Уровень N+1 →» / «Ещё раз» / «К уровням»
   ↓
После последнего уровня — вместо попапа победы попап «Ещё?»
   ↓
«Да» → SignalSink.send({ event: 'more_yes' })
«Нет» / закрыл → не отправляется ничего
```

Сохраняется не флаг `onboardingSeen: true`, а `onboardingVersion: number`.
Поменял правила — поднял версию — игрок увидит обновлённый онбординг.

Попап «Ещё?» показывается ровно один раз за установку: после ответа
`moreAsked` становится `true` и повторное прохождение девятого уровня даёт
обычный попап победы.

Аппаратная кнопка «назад» на Android идёт по тому же графу
(`ShellApp.handleBack()`); на главном экране она возвращает `false`, и
`main.ts` отдаёт управление ОС.

---

## 7. Инфраструктурные решения

### 7.1 Сохранение прогресса

`window.localStorage` для прогресса на Android использовать нельзя: мобильная
ОС может периодически очищать localStorage у WebView. `@capacitor/preferences`
ложится на SharedPreferences (Android) и UserDefaults (iOS), а в браузере
падает обратно на localStorage — там всё равно ничего лучше нет.

```
ProgressRepository            (интерфейс + чистые правила прогресса)
   ├── PreferencesProgressRepository   → APK
   └── MemoryProgressRepository        → тесты
```

Блоб из хранилища — недоверенные данные. `parseProgress(raw: unknown)` narrow'ит
его и возвращает `null` при любом несоответствии; вызывающий код подставляет
пустой прогресс. Потерять прогресс плохо, но игра, которая не запускается, хуже.

Правила прогресса (`isLevelUnlocked`, `withLevelCompleted`, `needsOnboarding`,
`nextLevelIndex`, ...) — чистые функции рядом с интерфейсом. Уровни открываются
строго по порядку.

### 7.2 Сигнал «игра интересна»

**Транспорт — ntfy.sh.** `POST` на `https://ntfy.sh/<topic>`, пуш прилетает в
приложение ntfy. Ни бота, ни бэкенда, ни токена.

**Честная модель угроз:** регистрации нет, поэтому **топик фактически является
паролем**. Кто знает топик — может и писать в него, и подписаться на него.

Практические выводы, зашитые в код:

- топик генерируется `scripts/new-game.ts`: 32 символа из 62-символьного
  алфавита, `randomBytes`. Руками не вводится;
- `NtfySignalSink` отказывается стартовать с топиком короче 16 символов или с
  символами вне `[A-Za-z0-9_-]`;
- в сообщении **нет пользовательских данных** — только `game=<id> event=more_yes`.
  На это есть отдельный тест;
- запрос — CORS «simple request», без preflight (D-005);
- доставка никогда не роняет UI: сеть отвалилась — `console.warn` и промис
  резолвится.

**Это не защищённая аналитика. Сигнал можно подделать. Для MVP допустимо.**

Shell не знает слова «ntfy»:

```typescript
export interface GameSignal { event: 'more_yes'; gameId: string }
export interface SignalSink { send(signal: GameSignal): Promise<void> }
```

Завтра PostHog, Firebase или свой эндпоинт — меняется одна строка в `main.ts`.

### 7.3 Safe areas и edge-to-edge

Android 15+ рисует приложение под системными панелями по умолчанию. Capacitor 8
(`com.getcapacitor.plugin.SystemBars`, встроен в `@capacitor/android`) инжектит
`--safe-area-inset-*` как inline-стиль на `documentElement` — он **не** заполняет
`env(safe-area-inset-*)`.

Поэтому в `tokens.css`:

```css
--safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
```

Вёрстка только на `env()` выглядит правильно в Chrome и залезает под статус-бар
на реальном телефоне. Плюс `viewport-fit=cover` в `index.html` — без него
инсеты не сообщаются вообще.

### 7.4 Модель наследования шаблона

**Template is copied, not inherited.** После создания новой игры её shell —
копия, а не общий код. Баг, исправленный в `game-template` через месяц, сам
собой в уже созданные игры не попадёт. Это нормально: npm-пакет, monorepo или
submodule здесь были бы преждевременной инфраструктурой.

Компенсация: `TEMPLATE_VERSION` в `src/game.config.ts`. Когда появится важный
shell-fix — по этому полю видно, какие игры стоит обновить руками.

---

## 8. Инструкции агенту

`CLAUDE.md` в корне. Один файл, не два: Claude Code читает его как проектную
память при старте сессии, а дублировать те же правила в `AGENTS.md` — значит
гарантированно получить два разошедшихся файла. `AGENTS.md` добавляется позже,
если реально появятся другие агенты.

---

## 9. Bootstrap новой игры

```bash
npm run new-game -- --name "Screw Mahjong" --id "com.example.screwmahjong"
```

Что делает: обновляет `package.json`, `index.html`, `capacitor.config.ts`,
`src/game.config.ts`; генерирует случайный ntfy-топик и печатает его один раз
(больше он нигде не сохраняется); валидирует формат appId и slug.
Поддерживает `--slug` и `--dry-run`.

Чего **не** делает: не трогает `android/`. Имя пакета там — часть пути
директории, текстовая замена оставила бы несобираемый проект (D-003). После
`new-game` нужно `npm run build && npx cap add android`.

`npm run verify-template` (`scripts/check-placeholders.ts`) падает, пока в
проекте остались строки шаблона — включая сгенерированный `android/`. Просить
агента «не забудь всё переименовать» ненадёжно; это — контроль.

---

## 10. CI

«typecheck + lint + test» недостаточно: можно получить полностью зелёные
юнит-тесты при том, что APK не собирается.

1. `typecheck`
2. `lint` — включая границы Shell/Mechanic
3. `test` — Vitest, два проекта (`mechanic` в node, `shell` в jsdom)
4. `build` — Vite, прод-сборка реально собирается
5. `e2e` — Playwright: полное прохождение всех уровней настоящими тапами по
   canvas → попап «Ещё?» → перехват реального запроса к ntfy
6. `cap add android` + `assembleDebug` — Gradle, APK реально собирается
7. `verify-template` — только в репозиториях игр, не в самом шаблоне

### Ручная проверка перед объявлением v1.0

Playwright в браузере **не доказывает**, что Android-сборка работает.
Capacitor 8 требует Android API 24+ и compile/target SDK 36, а Android 15+ ввёл
обязательное edge-to-edge, которое напрямую влияет на WebView и лейаут — то
есть ровно на DOM shell.

Один раз, руками, на эмуляторе **и** на физическом телефоне:

- [ ] меню и переходы между экранами;
- [ ] тапы по игровому полю;
- [ ] аппаратная кнопка «назад» на каждом экране;
- [ ] сворачивание/разворачивание приложения;
- [ ] сохранение прогресса после полного перезапуска;
- [ ] реальная доставка ntfy-сигнала на телефон;
- [ ] отсутствие налезания UI на статус-бар и вырез экрана;
- [ ] поворот экрана.

Только после этого — `TEMPLATE_VERSION = 1.0.0`.

**Текущий статус: `TEMPLATE_VERSION = '0.9.0'`.** Автоматика зелёная целиком,
ручная проверка на устройстве не проводилась.

Локально Android собрать нельзя: в окружении нет Java и Android SDK. Первый
реальный `assembleDebug` произойдёт в GitHub Actions.

---

## 11. Процесс создания новой игры

1. GitHub → `game-template` → **Use this template** → новый репозиторий.
2. `npm ci`
3. `npm run new-game -- --name "..." --id "com...."`
4. `npm run build && npx cap add android`
5. Положить концепт как `docs/rules.md`, заполнить `src/game.config.ts`.
6. Реализовать `src/mechanic/engine` — чистые функции, строгие `TState/TInput/TLevel`.
7. Написать `src/mechanic/render` — Phaser-сцена и обработка ввода.
8. Заполнить `src/mechanic/levels/levels.json` — 9 уровней, валидация уже есть.
9. `src/shell/**` не трогать.
10. `npm run check && npm run verify-template` + прогон на устройстве.
11. Capacitor → AAB → Google Play.

В идеале новая игра сводится ровно к четырём вещам: **rules + levels + engine +
renderer**. Это и есть критерий, что архитектура достигла цели.

---

## 12. Полезные внешние ресурсы

- **`node_modules/phaser/skills/`** — официальные скиллы Phaser 4. Первое место,
  куда смотреть при вопросе по API.
- **[Kenney](https://kenney.nl/assets/ui-pack)** — CC0-ассеты для UI.
- **[awesome-phaser](https://github.com/Raiper34/awesome-phaser)** — справочник
  плагинов, когда появится конкретная потребность.
- **`phaser4-rex-plugins`** — rexUI, если понадобится UI *внутри* игровой сцены.
  Для shell не нужен.
