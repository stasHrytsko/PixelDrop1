# game-template

Стартовый репозиторий для Android-игр: DOM-оболочка + Phaser-механика +
Capacitor. Оболочка написана и протестирована один раз; под новую игру меняется
только `src/mechanic/**`.

**Читать в таком порядке:** [`CLAUDE.md`](./CLAUDE.md) →
[`docs/architecture.md`](./docs/architecture.md) →
[`docs/decisions.md`](./docs/decisions.md).

## Новая игра

```bash
# GitHub → «Use this template» → новый репозиторий
npm ci
npm run new-game -- --name "Screw Mahjong" --id "com.example.screwmahjong"
npm run build && npx cap add android
```

Дальше — концепт в `docs/rules.md`, и реализовать `src/mechanic/**`:
`engine` (чистые правила) → `levels` (JSON) → `render` (Phaser-сцена).
`src/shell/**` не трогать.

## Команды

| | |
|---|---|
| `npm run dev` | dev-сервер |
| `npm run check` | typecheck + lint + test + build + e2e |
| `npm run verify-template` | падает, пока остались строки шаблона |
| `npm run cap:sync` | сборка + синхронизация в android/ |
| `npm run android:open` | открыть проект в Android Studio |

Сборка APK локально — [`docs/android-setup.md`](./docs/android-setup.md)
(Java и Android SDK без прав администратора).

## Что уже готово

Главный экран, онбординг с версионированием, сетка уровней с полосами
сложности и последовательной разблокировкой, экран игры, попап победы,
прогресс через `@capacitor/preferences`, инфраструктура сигнала через ntfy
(доступна играм, сама не вызывается — см. `docs/decisions.md` D-011),
аппаратная кнопка «назад», safe areas для Android 15+, bootstrap-скрипт,
CI со сборкой APK.

Механика — Pixel Drop v2 (`docs/rules.md`): перетаскивание тетромино на поле
по картинке-образцу, без числовых подсказок. Один тестовый уровень.
