import express from 'express'

const app = express()
app.use(express.json({ limit: '2mb' }))

const PORT = 3001
const MAX_SECRET = process.env.MAX_SECRET
const MAX_TOKEN = process.env.MAX_TOKEN
const MAX_API = 'https://platform-api.max.ru'

const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://host.docker.internal:18789'
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN
const OPENCLAW_AGENT_ID = process.env.OPENCLAW_AGENT_ID || 'main'

if (!MAX_SECRET) {
  console.error('MAX_SECRET is not set')
  process.exit(1)
}

if (!MAX_TOKEN) {
  console.error('MAX_TOKEN is not set')
  process.exit(1)
}

if (!OPENCLAW_TOKEN) {
  console.error('OPENCLAW_TOKEN is not set')
  process.exit(1)
}

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

async function sendMaxMessage({ userId, chatId, text }) {
  const qs = new URLSearchParams()

  if (userId) {
    qs.set('user_id', String(userId))
  } else if (chatId) {
    qs.set('chat_id', String(chatId))
  } else {
    throw new Error('sendMaxMessage: userId or chatId is required')
  }

  const resp = await fetch(`${MAX_API}/messages?${qs.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: MAX_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  const raw = await resp.text()

  if (!resp.ok) {
    throw new Error(`MAX send failed: ${resp.status} ${raw}`)
  }

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

async function editMaxMessage({ messageId, text }) {
  const resp = await fetch(`${MAX_API}/messages?message_id=${messageId}`, {
    method: 'PUT',
    headers: {
      Authorization: MAX_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  const raw = await resp.text()

  if (!resp.ok) {
    throw new Error(`MAX edit failed: ${resp.status} ${raw}`)
  }

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function extractMessageId(data) {
  if (!data || typeof data !== 'object') return null
  return data.message?.body?.mid ?? null
}

async function askOpenClaw({ userId, text }) {
  const resp = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      'Content-Type': 'application/json',
      'x-openclaw-agent-id': OPENCLAW_AGENT_ID,
    },
    body: JSON.stringify({
      model: `openclaw:${OPENCLAW_AGENT_ID}`,
      user: `max_${userId}`,
      messages: [
        { role: 'user', content: text }
      ]
    }),
  })

  const raw = await resp.text()

  if (!resp.ok) {
    throw new Error(`OpenClaw failed: ${resp.status} ${raw}`)
  }

  const data = JSON.parse(raw)
  const answer = data?.choices?.[0]?.message?.content?.trim()

  if (!answer) {
    throw new Error(`OpenClaw returned empty answer: ${raw}`)
  }

  return answer
}

app.post('/webhook', async (req, res) => {
  try {
    const secret = req.header('X-Max-Bot-Api-Secret')
    if (secret !== MAX_SECRET) {
      return res.status(401).json({ ok: false, error: 'invalid secret' })
    }

    const body = req.body

    console.log('MAX webhook body:')
    console.log(JSON.stringify(body, null, 2))

    res.status(200).json({ ok: true })

    if (body.update_type === 'bot_started') {
      const userId = body?.user_id
      const chatId = body?.chat_id

      try {
        await sendMaxMessage({
          userId,
          chatId,
          text: 'Бот подключен.\nНапишите сообщение.',
        })
      } catch (err) {
        console.error('bot_started send error:', err)
      }

      return
    }

    if (body.update_type === 'message_created') {
      const chatId = body?.message?.recipient?.chat_id
      const userId = body?.message?.sender?.user_id
      const text = body?.message?.body?.text?.trim()

      if (!userId || !text) {
        console.log('Skip empty or invalid message')
        return
      }

      // Отправляем индикатор ожидания
      let waitingMessageId = null
      try {
        const waitingResp = await sendMaxMessage({ userId, chatId, text: '⏳\u200B' })
        waitingMessageId = extractMessageId(waitingResp)
        console.log('Waiting message sent, id:', waitingMessageId)
      } catch (err) {
        console.error('Failed to send waiting message:', err)
      }

      let answer = null
      let openClawError = false

      try {
        console.log('OPENCLAW REQUEST TEXT:', text)
        answer = await askOpenClaw({ userId, text })
        console.log('OPENCLAW ANSWER:', answer)
      } catch (err) {
        console.error('message_created processing error:', err)
        openClawError = true
      }

      const replyText = openClawError
        ? 'Не удалось обработать сообщение.\nПопробуйте ещё раз.'
        : answer

      if (waitingMessageId) {
        try {
          await editMaxMessage({ messageId: waitingMessageId, text: replyText })
          console.log('MAX MESSAGE EDITED')
        } catch (editErr) {
          console.error('Failed to edit waiting message, using fallback:', editErr)
          try {
            await sendMaxMessage({ userId, chatId, text: replyText })
            console.log('MAX FALLBACK SENT')
          } catch (sendErr) {
            console.error('Fallback send error:', sendErr)
          }
        }
      } else {
        try {
          await sendMaxMessage({ userId, chatId, text: replyText })
          console.log('MAX OUTBOUND SENT (no waiting id)')
        } catch (sendErr) {
          console.error('Fallback send error:', sendErr)
        }
      }

      return
    }

    console.log(`Unhandled update_type: ${body.update_type}`)
  } catch (err) {
    console.error('Webhook processing error:', err)

    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: 'internal_error' })
    }
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`max-adapter listening on 0.0.0.0:${PORT}`)
})
