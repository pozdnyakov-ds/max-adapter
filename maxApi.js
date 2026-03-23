const MAX_API = 'https://platform-api.max.ru'
const MAX_TOKEN = process.env.MAX_TOKEN

export async function sendMaxMessage({ userId, chatId, text }) {
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

export async function editMaxMessage({ messageId, text }) {
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

export function extractMessageId(data) {
  if (!data || typeof data !== 'object') return null
  return data.message?.body?.mid ?? null
}
