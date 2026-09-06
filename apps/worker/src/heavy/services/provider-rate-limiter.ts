import { getRedisConnection } from "@chatbotx.io/worker-config"

const RATE_LIMIT_LUA = `
local current = redis.call("GET", KEYS[1])
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
if not current or now >= tonumber(current) then
  redis.call("SET", KEYS[1], now + interval, "PX", interval * 2)
  return 0
end
return tonumber(current) - now
`

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

/** Distributed minimum-interval limiter shared by all heavy worker processes. */
export async function waitForHeavyProviderSlot(input: {
  minIntervalMs: number
  provider: string
  workspaceId: string
}): Promise<void> {
  if (input.minIntervalMs <= 0) {
    return
  }

  const key = `heavy-provider-rate:${input.workspaceId}:${input.provider}`
  const redis = getRedisConnection()

  while (true) {
    const waitMs = Number(
      await redis.eval(
        RATE_LIMIT_LUA,
        1,
        key,
        Date.now().toString(),
        input.minIntervalMs.toString(),
      ),
    )
    if (waitMs <= 0) {
      return
    }
    await sleep(Math.min(waitMs, input.minIntervalMs))
  }
}
