import { sendMaxMessage } from './maxApi.js'
import { getRoute } from './sessionStore.js'

const OPENCLAW_ANNOUNCE_SECRET = process.env.OPENCLAW_ANNOUNCE_SECRET

export function normalizeAnnouncePayload(payload) {
  const openclawUser = payload.user ?? payload.openclawUser ?? payload.recipient ?? null
  const text = payload.text ?? payload.content ?? payload.message ?? null
  const sessionId = payload.session ?? payload.sessionId ?? undefined
  const metadata = payload.metadata ?? undefined

  if (!openclawUser || !text) return null

  return {
    openclawUser: String(openclawUser),
    text: String(text),
    ...(sessionId !== undefined && { sessionId }),
    ...(metadata !== undefined && { metadata }),
  }
}

export function registerAnnounceEndpoint(app) {
  app.post('/openclaw/announce', async (req, res) => {
    console.log('[announce] request received')
    console.log('[announce] headers:', JSON.stringify({
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization']
        ? req.headers['authorization'].replace(/Bearer\s+\S{4}(\S+)/, (_, tail) => `Bearer ****${tail.slice(-4)}`)
        : '(absent)',
    }))
    console.log('[announce] body:', JSON.stringify(req.body ?? {}))

    const auth = req.headers['authorization'] ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''

    if (!OPENCLAW_ANNOUNCE_SECRET || token !== OPENCLAW_ANNOUNCE_SECRET) {
      console.log('[announce] auth failed: token mismatch or OPENCLAW_ANNOUNCE_SECRET not set')
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }

    const normalized = normalizeAnnouncePayload(req.body ?? {})
    if (!normalized) {
      console.log('[announce] invalid payload — missing user or text')
      return res.status(400).json({ ok: false, error: 'invalid payload: user and text are required' })
    }
    console.log('[announce] payload normalized:', JSON.stringify(normalized))

    const route = getRoute(normalized.openclawUser)
    if (!route) {
      console.log(`[announce] route not found: ${normalized.openclawUser}`)
      return res.status(404).json({ ok: false, error: 'route not found' })
    }
    console.log(`[announce] route found: ${normalized.openclawUser} → userId=${route.userId}`)

    try {
      await sendMaxMessage({ userId: route.userId, chatId: route.chatId, text: normalized.text })
      console.log('[announce] sent')
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('[announce] send failed:', err)
      return res.status(502).json({ ok: false, error: 'failed to deliver message' })
    }
  })
}
