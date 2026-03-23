# MAX → OpenClaw: max-adapter

Адаптер-прослойка между мессенджером MAX и OpenClaw. Принимает сообщения через webhook, пересылает в OpenClaw и возвращает ответ пользователю.

## Архитектура

```
MAX → (webhook + secret) → max-adapter → OpenClaw → ответ → MAX
                                ↑
               OpenClaw → POST /openclaw/announce → MAX (async)
```

Контейнер `max-adapter` обращается к OpenClaw через `host.docker.internal` — специальный DNS-адрес, который резолвится в IP хост-машины. Трафик идёт: max-adapter → хост → OpenClaw. Флаг `--add-host=host.docker.internal:host-gateway` при запуске контейнера делает этот адрес доступным.

---

## Быстрый старт

### 1. Включить HTTP API в OpenClaw

```bash
nano /home/node/.openclaw/openclaw.json
```

Добавить в секцию `"gateway"`:

```json
"http": {
  "endpoints": {
    "chatCompletions": {
      "enabled": true
    }
  }
}
```

Перезапустить OpenClaw:

```bash
docker restart openclaw-openclaw-gateway-1
```

Проверить:

```bash
curl http://127.0.0.1:18789/health
```

---

### 2. Проверить OpenClaw API

```bash
curl -s http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer ТВОЙ_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-openclaw-agent-id: main" \
  -d '{
    "model": "openclaw:main",
    "user": "test_user",
    "messages": [{"role":"user","content":"Привет"}]
  }'
```

---

### 3. Создать файл переменных окружения

```bash
cp .env.example .env
nano .env
```

Заполнить значения (см. раздел [Переменные окружения](#переменные-окружения)). Файл `.env` не коммитится в git.

---

### 4. Собрать контейнер

```bash
cd /путь/к/max-adapter
docker build --no-cache -t max-adapter .
```

---

### 5. Запустить контейнер

```bash
docker rm -f max-adapter 2>/dev/null || true

docker run -d \
  --name max-adapter \
  --restart unless-stopped \
  --network max-net \
  --add-host=host.docker.internal:host-gateway \
  --env-file .env \
  -p 3001:3001 \
  max-adapter
```

---

### 6. Зарегистрировать webhook в MAX

⚠️ Для работы webhook сервер должен быть доступен из интернета:
- белый (публичный) IP-адрес или домен
- обязателен HTTPS — MAX не принимает `http://`
- порт 3001 должен быть открыт и проброшен (или стоять за reverse proxy, например nginx)

```bash
curl -X POST https://api.max.ru/bot/v1/subscriptions \
  -H "Authorization: Bearer ТВОЙ_MAX_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://ТВОЙ_ДОМЕН/webhook",
    "secret": "ТВОЙ_WEBHOOK_SECRET"
  }'
```

- `url` — endpoint max-adapter, путь `/webhook`
- `secret` — должен совпадать с `MAX_SECRET` в `.env`

---

### 7. Проверить связь из контейнера

```bash
docker exec -it max-adapter sh -lc "wget -qO- \
  --header='Authorization: Bearer ТВОЙ_GATEWAY_TOKEN' \
  --header='Content-Type: application/json' \
  --post-data='{\"model\":\"openclaw:main\",\"user\":\"test\",\"messages\":[{\"role\":\"user\",\"content\":\"Привет\"}]}' \
  http://host.docker.internal:18789/v1/chat/completions"
```

---

### 8. Смотреть логи

```bash
docker logs -f max-adapter
```

---

### 9. Тест

Написать боту в MAX:

```
Привет! Кто ты?
```

Бот сначала покажет ⏳, затем заменит его ответом от OpenClaw.

---

## Переменные окружения

Все переменные задаются в файле `.env` (на основе `.env.example`).

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `MAX_TOKEN` | да | — | Токен бота MAX |
| `MAX_SECRET` | да | — | Секрет webhook для проверки входящих запросов |
| `OPENCLAW_TOKEN` | да | — | Токен OpenClaw Gateway |
| `OPENCLAW_URL` | нет | `http://host.docker.internal:18789` | URL OpenClaw API |
| `OPENCLAW_AGENT_ID` | нет | `main` | ID агента OpenClaw |
| `ALLOWED_USERS` | нет | — | Список user_id через запятую. Если не задано — бот отвечает всем |
| `OPENCLAW_ANNOUNCE_SECRET` | нет | — | Токен для `/openclaw/announce`. Если не задан — endpoint всегда возвращает 401 |
| `ROUTE_STORE_TTL_HOURS` | нет | `168` | TTL хранилища маршрутов в часах |

### Allowlist: как узнать свой user_id

Напишите боту любое сообщение и посмотрите логи:

```bash
docker logs -f max-adapter
```

В выводе будет полный тел webhook — найдите `message.sender.user_id`. Это ваш MAX ID.

Затем добавьте в `.env`:

```
ALLOWED_USERS=4399699
```

Несколько пользователей — через запятую:

```
ALLOWED_USERS=4399699,123456789
```

---

## Асинхронная доставка из OpenClaw

OpenClaw может самостоятельно инициировать отправку сообщения пользователю через endpoint `/openclaw/announce`. Маршрут к пользователю сохраняется автоматически при каждом входящем сообщении в MAX.

**Endpoint:** `POST /openclaw/announce`

**Авторизация:** `Authorization: Bearer <OPENCLAW_ANNOUNCE_SECRET>`

**Тело запроса** (поддерживаются алиасы полей):

| Поле | Алиасы | Обязательное |
|---|---|---|
| `user` | `openclawUser`, `recipient` | да |
| `text` | `content`, `message` | да |
| `sessionId` | `session` | нет |
| `metadata` | — | нет |

**Пример:**

```bash
curl -X POST https://ТВОЙ_ДОМЕН/openclaw/announce \
  -H "Authorization: Bearer OPENCLAW_ANNOUNCE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "max_4399699",
    "text": "Задача выполнена"
  }'
```

**Коды ответа:**

| Код | Причина |
|---|---|
| 200 | Сообщение доставлено |
| 400 | Нет `user` или `text` в payload |
| 401 | Неверный или отсутствующий токен |
| 404 | Маршрут не найден (пользователь ещё не писал боту или TTL истёк) |
| 502 | Ошибка при отправке в MAX API |

**Важно:** маршрут появляется после первого сообщения пользователя боту. Если пользователь ни разу не писал или истёк TTL (`ROUTE_STORE_TTL_HOURS`) — вернётся 404.

---

## Обновление

При изменении `.env` или кода:

```bash
docker build --no-cache -t max-adapter .
docker rm -f max-adapter

docker run -d \
  --name max-adapter \
  --restart unless-stopped \
  --network max-net \
  --add-host=host.docker.internal:host-gateway \
  --env-file .env \
  -p 3001:3001 \
  max-adapter
```
