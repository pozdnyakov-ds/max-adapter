const ROUTE_STORE_TTL_HOURS = parseInt(process.env.ROUTE_STORE_TTL_HOURS || '168', 10)
const TTL_MS = ROUTE_STORE_TTL_HOURS * 60 * 60 * 1000

const store = new Map()

export function saveRoute(openclawUser, { userId, chatId }) {
  store.set(openclawUser, { userId, chatId, updatedAt: Date.now() })
  console.log(`[route] saved: ${openclawUser} → userId=${userId} chatId=${chatId}`)
}

export function getRoute(openclawUser) {
  const entry = store.get(openclawUser)
  if (!entry) return null
  if (Date.now() - entry.updatedAt > TTL_MS) {
    store.delete(openclawUser)
    return null
  }
  return entry
}
