# Локальная сборка APK без прав администратора

Как поставить Java и Android SDK, ничего не устанавливая в систему. Всё
складывается в одну папку и удаляется её удалением.

Нужно, чтобы собирать APK и ставить игру на телефон, не дожидаясь CI. Для
работы над механикой не нужно вообще — там хватает `npm run dev`.

---

## Почему не через установщик

`winget install` для JDK требует подтверждения UAC. В автоматическом сценарии
(и у агента) это тупик: окно висит, ввода нет. Portable-архивы обходят вопрос
целиком — распаковка в домашнюю папку прав не требует.

---

## Что ставится

| Что | Куда | Размер |
|---|---|---|
| Temurin JDK 21 | `<DEV>\jdk-21` | ~196 МБ |
| Android cmdline-tools | `<DEV>\android-sdk\cmdline-tools\latest` | ~150 МБ |
| platform-tools (adb) | `<DEV>\android-sdk\platform-tools` | ~8 МБ |
| platforms;android-36 | `<DEV>\android-sdk\platforms` | ~63 МБ |
| build-tools;36.0.0 | `<DEV>\android-sdk\build-tools` | ~56 МБ |

`<DEV>` — любая папка, например `C:\Users\<ты>\dev`.

JDK **21**, а не свежее: этого требует Capacitor 8, и это же стоит в
`.github/workflows/ci.yml`. Локальная и облачная сборки должны совпадать —
иначе «у меня работает» перестаёт что-либо значить.

---

## Шаги

**1. Скачать архивы**

```bash
mkdir -p /c/Users/<ты>/dev && cd /c/Users/<ты>/dev
curl -sSL -o jdk21.zip "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse"
curl -sSL -o cmdline-tools.zip "https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip"
```

Актуальный номер сборки cmdline-tools — на developer.android.com/studio,
раздел «Command line tools only».

**2. Распаковать**

JDK — в `<DEV>\jdk-21` (внутри архива одна папка, её содержимое и нужно).

cmdline-tools — строго в `<DEV>\android-sdk\cmdline-tools\latest`. Именно
`latest`: `sdkmanager` ищет себя по этому пути и без него не стартует.

**3. Переменные окружения, уровень пользователя**

```powershell
[Environment]::SetEnvironmentVariable('JAVA_HOME','<DEV>\jdk-21','User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME','<DEV>\android-sdk','User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT','<DEV>\android-sdk','User')
```

Плюс в `Path`: `<DEV>\jdk-21\bin`, `<DEV>\android-sdk\platform-tools`,
`<DEV>\android-sdk\cmdline-tools\latest\bin`.

`'User'`, а не `'Machine'` — снова чтобы не требовались права администратора.

**4. Доставить пакеты SDK**

```powershell
android --no-metrics sdk install "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

Три подводных камня:

- `sdkmanager` объявлен устаревшим; актуальный инструмент — `android` из того
  же `cmdline-tools\latest\bin`;
- `--no-metrics` **глобальный** флаг и должен стоять **до** `sdk install`,
  иначе команда падает с «Unknown option»;
- у старого `sdkmanager --licenses` подача согласия через конвейер не
  срабатывает — пакеты молча пропускаются с «license is not accepted».
  У нового `android` эта проблема не воспроизводится.

---

## Сборка

```bash
npm run build
npx cap add android          # только если папки android/ ещё нет
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK окажется в `android/app/build/outputs/apk/debug/app-debug.apk`.

Первый запуск Gradle тянет свой дистрибутив и зависимости — несколько минут.
Дальше инкрементальные сборки укладываются в секунды.

## На телефон

```bash
npx cap run android
```

Телефон по USB, в настройках разработчика включена отладка по USB. Проверить,
что устройство видно: `adb devices`.

Это и есть ручной чеклист из `architecture.md` §10 — тач, вырезы экрана,
аппаратная кнопка «назад», сохранение прогресса после перезапуска.
