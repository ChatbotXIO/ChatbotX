/** The test preset sentinel: a real Redis server never listens on port 1. */
const NON_ROUTABLE_PORT = "1"

/** Return a usable Redis URL, or null so integration tests skip themselves. */
export function realRedisUrl(): string | null {
  const url = process.env.REDIS_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === NON_ROUTABLE_PORT ? null : url
  } catch {
    return null
  }
}
