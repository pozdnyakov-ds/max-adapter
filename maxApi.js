import { Bot } from '@maxhub/max-bot-api'

const MAX_API = 'https://platform-api.max.ru'
const bot = new Bot(process.env.MAX_TOKEN)

export async function sendMaxMessage({ userId, chatId, text }) {
  if (userId) {
    return await bot.api.sendMessageToUser(Number(userId), text)
  } else if (chatId) {
    return await bot.api.sendMessageToChat(Number(chatId), text)
  } else {
    throw new Error('sendMaxMessage: userId or chatId is required')
  }
}

export async function editMaxMessage({ messageId, text }) {
  const resp = await fetch(`${MAX_API}/messages?message_id=${messageId}`, {
    method: 'PUT',
    headers: {
      Authorization: process.env.MAX_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  const raw = await resp.text()

  if (!resp.ok) {
    throw new Error(`MAX edit failed: ${resp.status} ${raw}`)
  }
}

export function extractMessageId(data) {
  if (!data || typeof data !== 'object') return null
  return data.body?.mid ?? null
}
