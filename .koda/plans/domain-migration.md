# План: миграция на прод-домен lextr.ru

**Контекст:** Lex готовится к публикации в RuStore и AppGallery. Сейчас приложение живёт
на стейджинг-сервере как `https://lex.2-way.ru`. Зарегистрирован новый домен `lextr.ru`
(30.09.2026, RU-CENTER, NS `ns1.r01.ru`/`ns2.r01.ru`, статус `REGISTERED, DELEGATED,
UNVERIFIED`, paid-till 30.09.2027). Цель — развести прод и стейджинг по разным доменам
и разным серверам.

**Дата составления:** 30 сентября 2026
**Автор:** Koda CLI

---

## Целевая схема

| Домен | IP | Роль |
|---|---|---|
| `lextr.ru` + `www.lextr.ru` | 45.155.204.194 | **Прод** (RuStore/AppGallery, PWA) |
| `lex.2-way.ru` | 45.155.204.194 | **Алиас прода** (старые сборки с вшитым `VITE_PROXY_URL`) |
| `stage.lextr.ru` | 89.125.130.69 | **Стейджинг** (noindex) |

### Серверы

| | `taskman-prod` (45.155.204.194) | `taskman-stage` (89.125.130.69) |
|---|---|---|
| RAM | 3.9 ГБ (2.4 ГБ free) | 1.9 ГБ (953 МБ free) |
| Диск | 29 ГБ, 17 ГБ free | 15 ГБ, 3.1 ГБ free (79%) |
| nginx | 1.30.2 | 1.18.0 (Ubuntu) |
| Node.js | **НЕТ — установить** | v20.20.2 (`/usr/bin/node`) |
| Docker | 29.5.3 | есть |
| certbot | 1.21.0 | есть |
| Уже крутит | TaskMan, Radio Andrews, weban (7 контейнеров) | Lex, TaskMan staging (3 контейнера) |
| Свободные порты | 8004 свободен (заняты 5001, 8001, 8000, 8002) | 8004 занят Lex |

### Ключевые решения

1. **`lex.2-way.ru` — алиас, а не редирект.** `301/302` на `POST /translate` может
   превратиться в `GET` и потерять тело запроса. API-локации отдаются напрямую
   (тот же `root` + `proxy_pass`), редирект — только для статики/страниц.
2. **`stage.lextr.ru` — поддомен, а не чужой домен.** Origin влияет на CORS, scope
   service worker'а, IndexedDB и `lex_device_id`; стейдж должен быть копией прода.
3. **Прод на 45.155.204.194.** Больше RAM и диска; на stage диск на 79% и уже тесно
   для `npm ci` + сборки клиента.
4. **Деплой на прод — вручную** (`make deploy` по ssh). CD через GitHub Actions —
   отдельная задача.
5. **Порт 8004 на проде** привязать к `127.0.0.1`, а не `0.0.0.0` (сейчас на stage
   прокси торчит наружу).

### Известные готчи

- **`YANDEX_FOLDER_ID`** — есть в `.env` на stage, но **отсутствует в `.env.example`**.
  В `proxy/services/tts.py` есть хардкод-дефолт `b1gqq9rjega7119p3a2f`. На проде
  задать явно.
- **`client/.env.local` в `.gitignore`** — на проде создать вручную, иначе
  `VITE_APP_TOKEN` не попадёт в сборку и клиент получит 403.
- **certbot только `--nginx`**, не `standalone` (инцидент 22.09.2026: renew молча
  проваливался, т.к. порты 80/443 заняты nginx).
- **`nginx.example` в `.gitignore`** — переносится на сервер вручную.
- **Инструмент `replace` съедает `$$` в Makefile** — рецепты писать без shell-переменных.
- **`make deploy` на master содержит guard** (`/tmp/lex-deploy-stamp`, коммит b44d859),
  но рабочее дерево сейчас на ветке `rustore-ready` (c7aca30) — **без guard**.
  `master` = `rustore-ready` + `13a994c` + `b44d859`, т.е. master впереди.
- **`lex.2-way.ru` на stage**: после переключения DNS сертификат перестанет
  обновляться (домен указывает на другой IP) — конфиг и сертификат со stage удалить.

---

## Шаги

- [x] **0. Привести рабочее дерево в порядок**
    - Навыки: запуск команд
    - Описание: переключиться с `rustore-ready` на `master` (рабочее дерево чистое,
      переключение безопасно). Убедиться, что guard-проверка `/tmp/lex-deploy-stamp`
      присутствует в `Makefile`. Проверить отступы: `sed -n '/^deploy:/,$p' Makefile | cat -A`
      (должны быть `^I`, не пробелы).
    - Файлы: `Makefile`

- [x] **1. DNS-записи и подтверждение регистранта**
    - Навыки: —
    - Описание: подтвердить данные регистранта в личном кабинете RU-CENTER (статус
      `UNVERIFIED` — без подтверждения домен могут приостановить). Создать A-записи
      в зоне `lextr.ru` (панель r01.ru): `@` → `45.155.204.194`, `www` → `45.155.204.194`,
      `stage` → `89.125.130.69`, TTL 300. В зоне `2-way.ru` переключить
      `lex` → `45.155.204.194` (сейчас `89.125.130.69`).
    - Проверка: `dig +short lextr.ru A @8.8.8.8`, `dig +short stage.lextr.ru A @8.8.8.8`,
      `dig +short lex.2-way.ru A @8.8.8.8`. Делегирование `.ru` расходится от пары
      часов до суток — записи можно создавать сразу.
    - Файлы: —

- [x] **2. CORS-дефолты в прокси + тесты**
    - Навыки: кодирование
    - Описание: добавить `https://lextr.ru`, `https://www.lextr.ru`,
      `https://stage.lextr.ru` в `DEFAULT_ALLOWED_ORIGINS`. Старый
      `https://lex.2-way.ru` **оставить** — он нужен алиасу. Обновить тест
      `test_all_platform_origins_in_default_list`.
    - Файлы: `proxy/main.py`, `tests/test_token_auth.py`

- [x] **3. Обновить примеры env и документацию**
    - Навыки: кодирование
    - Описание: новые URL в примерах и текстах. Заодно добавить `YANDEX_FOLDER_ID`
      в `.env.example` (сейчас отсутствует, хотя используется в `tts.py`).
    - Файлы: `.env.example`, `client/.env.example`, `README.md`, `KODA.md`,
      `docs/metrics-guide.md`

- [x] **4. `nginx.example`: три домена**
    - Навыки: кодирование
    - Описание: server-блок `lextr.ru` + `www.lextr.ru` (прод, основной);
      server-блок `lex.2-way.ru` (алиас — тот же `root` и `proxy_pass`, **без
      редиректа на API-локациях**, `301` только для статики/страниц);
      server-блок `stage.lextr.ru` (`X-Robots-Tag: noindex, nofollow`).
      Пути сертификатов под новые домены. Учесть, что на проде nginx 1.30.2 —
      локальные `types {}` для `woff2`/`manifest+json` могут быть избыточны
      (проверить, что не конфликтуют с `mime.types`).
    - Файлы: `nginx.example`

- [x] **5. Прод-сервер: подготовка окружения**
    - Навыки: запуск команд
    - Описание: на 45.155.204.194 установить Node.js 20 (nodesource, как на stage);
      `git clone` репозитория в `/home/abo/lex`; создать `.env` (YANDEX_API_KEY,
      YANDEX_FOLDER_ID, APP_TOKENS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
      GLOBAL_DAILY_CHAR_LIMIT) и `client/.env.local` (VITE_APP_TOKEN,
      VITE_PROXY_URL=`https://lextr.ru`, VITE_RUSTORE_URL, VITE_DOWNLOAD_URL).
      Привязать порт прокси к `127.0.0.1:8004`.
    - Файлы: `docker-compose.yml`

- [x] **6. Прод-сервер: деплой, nginx, сертификат**
    - Навыки: запуск команд
    - Описание: `make deploy` (guard проверит, что `client/dist/index.html`
      обновился). Перенести nginx-конфиг в `/etc/nginx/conf.d/lextr.ru.conf`,
      `nginx -t`, reload. Сертификат:
      `certbot certonly --nginx -d lextr.ru -d www.lextr.ru -d lex.2-way.ru`.
      Проверить, что порт 8004 не конфликтует с существующими контейнерами.
    - Файлы: —

- [x] **7. Стейдж: `stage.lextr.ru` + вывод `lex.2-way.ru`**
    - Навыки: запуск команд
    - Описание: на 89.125.130.69 добавить server-блок `stage.lextr.ru` с
      `X-Robots-Tag: noindex, nofollow`; `certbot certonly --nginx -d stage.lextr.ru`.
      После переключения DNS удалить `/etc/nginx/conf.d/lex.2-way.ru.conf` и
      сертификат `lex.2-way.ru` (иначе renew будет падать). Убедиться, что
      `stage.lextr.ru` отдаёт ту же сборку, что раньше отдавал `lex.2-way.ru`.
    - Файлы: —

- [x] **8. Проверка end-to-end**
    - Навыки: запуск команд
    - Описание: `curl` health-check (`GET /`), `/translate` с токеном и без
      (ожидаем 200 / 403), CORS-preflight с `Origin: https://lextr.ru`,
      `GET /quota`, проверка кэш-заголовков (`X-Cached`), HTTPS-редирект с 80,
      отсутствие индексации stage (`X-Robots-Tag`), работа алиаса
      `lex.2-way.ru` (API без редиректа). Прогон `make check`.
    - Файлы: —

- [ ] **9. Перенос данных пользователя**
    - Навыки: —
    - Описание: IndexedDB не переносится между origin'ами. Экспорт словаря JSON
      на `lex.2-way.ru` → импорт на `lextr.ru`. Проверить, что настройки и
      `lex_device_id` создались заново (квота начнётся с нуля — норма).
    - Файлы: —

- [ ] **10. Документация + semver**
    - Навыки: docs-update, semver-checker
    - Описание: актуализировать README/KODA.md (схема прод/стейдж, деплой на два
      сервера, алиас-домен). Определить тип бампа (ожидаю patch — конфигурационное
      изменение без новых фич), обновить версию в 4 файлах + `uv.lock`.
    - Файлы: `README.md`, `KODA.md`, `pyproject.toml`, `client/package.json`,
      `client/src-tauri/tauri.conf.json`, `client/android/app/build.gradle`, `uv.lock`
    - **Выполнено** (коммит `bd02ce9`, v1.28.3 → 1.28.4, patch, versionCode 78).

---

## Готчи, найденные при выкате

- **`upstream lex_proxy` нельзя объявлять дважды** в одном `http`-контексте.
  При инлайне в каждый server-конфиг добавление второго домена на том же хосте
  (прод + алиас, прод + стейдж) ломает `nginx -t` с «duplicate upstream».
  Решение: вынесен в отдельный файл `nginx-lex-upstream.conf` (коммит `99badee`).
- **`gzip on` закомментирован в `nginx.conf`** на проде (в отличие от стейджа) —
  бандл 460 КБ отдавался несжатым. Теперь `gzip on` задаётся в сниппете локаций,
  конфиг не зависит от хоста.
- **`index index.html` минует `location /`**: `/` превращается во внутренний
  редирект на `/index.html`, который матчится `location = /index.html`. Редирект
  алиас-домена продублирован в этой локации, `$request_uri` сохраняет исходный путь.
- **`X-Robots-Tag` не наследуется**: nginx не берёт `add_header` из server-блока,
  если локация объявляет свой. Дублируется в каждой локации.
- **`sudo` на стейдже требует пароль** (на проде — нет). Nginx-шаги на стейдже
  выполняются вручную скриптом `setup-stage-nginx.sh`.
- **Порядок шагов на стейдже важен**: старый `lex.2-way.ru.conf` объявляет
  `upstream lex_proxy` сам, поэтому удаляется ДО установки `lex-upstream.conf`.
- **`nginx.example` и сниппеты в `.gitignore`** — на серверы переносятся вручную
  (`cat file | ssh host 'sudo tee ...'`).
- **`lex.2-way.ru` на стейдж-IP** отдаётся default server'ом (200), т.к. своего
  блока для домена там больше нет. DNS указывает на прод, практического вреда нет.

---

## Порядок выката (важно)

1. DNS-записи созданы, делегирование разошлось.
2. Прод-сервер подготовлен, `make deploy` прошёл, nginx отвечает на IP.
3. Сертификаты выпущены, HTTPS работает.
4. **Только после этого** переключить `lex.2-way.ru` на прод-IP и убрать конфиг со stage.
5. Проверка end-to-end.
6. Перенос данных пользователя.

## Вне этого плана

- **CD через GitHub Actions для stage** — отдельная задача.
- **`lex.2-way.ru` держать живым минимум год** — после релиза в RuStore появятся
  сборки с вшитым `VITE_PROXY_URL=https://lex.2-way.ru`.
- **`support@lextr.ru`** — оба маркетплейса требуют контактный email в карточке.
- **URL политики конфиденциальности** для карточек RuStore/AppGallery:
  `https://lextr.ru/privacy` и `https://lextr.ru/terms` (страницы уже есть).
- **Товарный знак «Lex»** — для AppGallery (международный рынок) стоит проверить
  в реестре Роспатента; есть журнал Lex, Lexus и множество «Lex»-приложений.
