import type Redis from "ioredis"

type AdmitWithinLimitStatus = "admitted" | "refused" | "missing"

type AdmitWithinLimitResult = {
  status: AdmitWithinLimitStatus
  value: number
}

/** Lua `tonumber` accepts fractions; live counters and arguments must be integers. */
const LUA_TO_INTEGER =
  "local function toint(v) local n = tonumber(v) if n and n == math.floor(n) then return n end return nil end"

const DECREMENT_MISSING_CODE = -1

const liveCounterScripts = {
  admitWithinLimit: `
${LUA_TO_INTEGER}
local currentValue = redis.call('HGET', KEYS[1], ARGV[1])
if not currentValue then return { -1, 0 } end
local current, limit = toint(currentValue), toint(ARGV[2])
if not current then
  return redis.error_reply('ERR live counter field is not an integer')
end
if not limit then
  return redis.error_reply('ERR live counter argument is not an integer')
end
local normalized = math.max(0, current)
if limit >= 0 and normalized + 1 > limit then return { 0, normalized } end
local next = normalized + 1
redis.call('HSET', KEYS[1], ARGV[1], next)
return { 1, next }
`,
  decrementFloor: `
${LUA_TO_INTEGER}
local currentValue = redis.call('HGET', KEYS[1], ARGV[1])
local current = currentValue and toint(currentValue)
local count = toint(ARGV[2])
if currentValue and not current then
  return redis.error_reply('ERR live counter field is not an integer')
end
if not count then
  return redis.error_reply('ERR live counter argument is not an integer')
end
if not currentValue then return ${DECREMENT_MISSING_CODE} end
local next = math.max(0, current - count)
redis.call('HSET', KEYS[1], ARGV[1], next)
return next
`,
} as const

const ADMIT_STATUS_BY_CODE = {
  1: "admitted",
  0: "refused",
  [-1]: "missing",
} as const satisfies Record<-1 | 0 | 1, AdmitWithinLimitStatus>

type AdmitStatusCode = keyof typeof ADMIT_STATUS_BY_CODE

type LiveCounterScriptsClient = Redis & {
  admitWithinLimit: (
    key: string,
    field: string,
    limit: string,
  ) => Promise<[status: AdmitStatusCode, value: number]>
  decrementFloor: (key: string, field: string, count: string) => Promise<number>
}

const registeredClients = new WeakSet<Redis>()

function withLiveCounterScripts(client: Redis): LiveCounterScriptsClient {
  if (!registeredClients.has(client)) {
    for (const [name, lua] of Object.entries(liveCounterScripts)) {
      client.defineCommand(name, { numberOfKeys: 1, lua })
    }
    registeredClients.add(client)
  }
  return client as LiveCounterScriptsClient
}

export const liveCounterScriptsFactory = (
  getRedisClient: () => Promise<Redis>,
) => ({
  async admitWithinLimit(
    key: string,
    field: string,
    limit: number | null,
  ): Promise<AdmitWithinLimitResult> {
    const client = withLiveCounterScripts(await getRedisClient())
    const [status, value] = await client.admitWithinLimit(
      key,
      field,
      String(limit ?? -1),
    )
    return { status: ADMIT_STATUS_BY_CODE[status], value }
  },

  async decrementFloor(
    key: string,
    field: string,
    count: number,
  ): Promise<number | null> {
    const client = withLiveCounterScripts(await getRedisClient())
    const result = await client.decrementFloor(key, field, String(count))
    return result === DECREMENT_MISSING_CODE ? null : result
  },
})
