# MAX → OpenClaw интеграция через max-adapter

## 1. Включить HTTP API в OpenClaw

```bash
nano /home/node/.openclaw/openclaw.json
```

Добавить в `"gateway"`:

```json
"http": {
  "endpoints": {
    "chatCompletions": {
      "enabled": true
    }
  }
}
```

Перезапуск:

```bash
docker restart openclaw-openclaw-gateway-1
```

Проверка:

```bash
curl http://127.0.0.1:18789/health
```

---

## 2. Проверить OpenClaw API

```bash
curl -s http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer ТВОЙ_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-openclaw-agent-id: main" \
  -d '{
    "model": "openclaw:main",
    "user": "test_user",
    "messages": [
      {"role":"user","content":"Привет"}
    ]
  }'
```

---

## 3. Подготовить max-adapter

```bash
cd /home/xxx/projects/max-adapter
```

---

## 4. Собрать контейнер

```bash
docker build --no-cache -t max-adapter .
```

---

## 5. Запустить max-adapter

```bash
docker rm -f max-adapter 2>/dev/null || true

docker run -d \
  --name max-adapter \
  --restart unless-stopped \
  --network max-net \
  --add-host=host.docker.internal:host-gateway \
  -e MAX_SECRET='ТВОЙ_WEBHOOK_SECRET' \
  -e MAX_TOKEN='ТВОЙ_MAX_BOT_TOKEN' \
  -e OPENCLAW_URL='http://host.docker.internal:18789' \
  -e OPENCLAW_TOKEN='ТВОЙ_GATEWAY_TOKEN' \
  -e OPENCLAW_AGENT_ID='main' \
  -p 3001:3001 \
  max-adapter
```

---

## 6. Создать webhook в MAX

⚠️ URL должен быть доступен извне (не localhost)

```bash
curl -X POST https://api.max.ru/bot/v1/subscriptions \
  -H "Authorization: Bearer ТВОЙ_MAX_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://ТВОЙ_ДОМЕН/webhook",
    "secret": "ТВОЙ_WEBHOOK_SECRET"
  }'
```

### Важно:
- `url` → endpoint твоего max-adapter (обычно `/webhook`)
- `secret` → должен совпадать с `MAX_SECRET`

---

## 7. Проверить связь из контейнера

```bash
docker exec -it max-adapter sh -lc "wget -qO- \
  --header='Authorization: Bearer ТВОЙ_GATEWAY_TOKEN' \
  --header='Content-Type: application/json' \
  --post-data='{\"model\":\"openclaw:main\",\"user\":\"test\",\"messages\":[{\"role\":\"user\",\"content\":\"Привет\"}]}' \
  http://host.docker.internal:18789/v1/chat/completions"
```

---

## 8. Смотреть логи

```bash
docker logs -f max-adapter
```

---

## 9. Тест

Написать боту в MAX:

```
Привет! Кто ты?
```

---

## Архитектура

```
MAX → (webhook + secret) → max-adapter → OpenClaw → ответ → MAX
```

---

## Переменные окружения

- `MAX_TOKEN` — токен бота MAX (для API вызовов)
- `MAX_SECRET` — секрет webhook (проверка входящих запросов)
- `OPENCLAW_URL` — URL OpenClaw API
- `OPENCLAW_TOKEN` — токен OpenClaw
- `OPENCLAW_AGENT_ID` — ID агента (например `main`)
