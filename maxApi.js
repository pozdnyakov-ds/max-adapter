import { Bot } from '@maxhub/max-bot-api'

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
  return await bot.api.editMessage(messageId, { text })
}

export function extractMessageId(data) {
  if (!data || typeof data !== 'object') return null
  return data.body?.mid ?? null
}
