import type Redis from "ioredis"

export const LIVE_RESERVATION_MAX_AGE_MS = 10_000

const RESERVATION_FIELD_SEPARATOR = ":r:"
const INFLIGHT_FIELD_SUFFIX = "Inflight"
const SETTLED_FIELD_SUFFIX = "Settled"

/** Hash field storing one reservation's last-touch timestamp. */
export const reservationFieldFor = (
  metric: string,
  reservationId: string,
): string => `${metric}${RESERVATION_FIELD_SEPARATOR}${reservationId}`

/** Hash field storing the exact number of reservations for a metric. */
export const inflightFieldFor = (metric: string): string =>
  `${metric}${INFLIGHT_FIELD_SUFFIX}`

/** Hash field storing the monotonic number of settled increments for a metric. */
export const settledFieldFor = (metric: string): string =>
  `${metric}${SETTLED_FIELD_SUFFIX}`

export type ReserveWithinLimitStatus = "reserved" | "refused" | "missing"

export type ReserveWithinLimitResult = {
  status: ReserveWithinLimitStatus
  value: number
}

export type HsetWithInflightMode = "set" | "setnx"

export type HsetWithInflightResult =
  | { status: "written"; value: number }
  | { status: "exists" }
  | { status: "fenced" }

/** Lua `tonumber` accepts fractions; every counter and timestamp here must be an integer. */
const LUA_TOINT =
  "local function toint(v) local n = tonumber(v) if n and n == math.floor(n) then return n end return nil end"

const LUA_COLLECT_STALE_RESERVATION_FIELDS = `
local stale, survivingInflight = {}, 0
local all = redis.call('HGETALL', KEYS[1])
for i = 1, #all, 2 do
  if string.sub(all[i], 1, #prefix) == prefix then
    local at = toint(all[i + 1])
    if not at then
      return redis.error_reply('ERR live counter reservation timestamp is not an integer')
    end
    if at < cutoff then stale[#stale + 1] = all[i] else survivingInflight = survivingInflight + 1 end
  end
end`

const LUA_DELETE_STALE_RESERVATION_FIELDS = `
for i = 1, #stale, 1000 do
  redis.call('HDEL', KEYS[1], unpack(stale, i, math.min(i + 999, #stale)))
end`

const liveCounterScripts = {
  reserveWithinLimit: `
${LUA_TOINT}
local f, r = ARGV[1], ARGV[1] .. '${RESERVATION_FIELD_SEPARATOR}' .. ARGV[3]
local v = redis.call('HMGET', KEYS[1], f, f .. '${INFLIGHT_FIELD_SUFFIX}', r)
if not v[1] then return { -1, 0 } end
local current, inflight = toint(v[1]), toint(v[2] or '0')
if not current or not inflight then
  return redis.error_reply('ERR live counter field is not an integer')
end
if v[3] then
  if not toint(v[3]) then return redis.error_reply('ERR live counter reservation timestamp is not an integer') end
  return { 1, current }
end
if not toint(ARGV[4]) then return redis.error_reply('ERR live counter reservation timestamp is not an integer') end
local limit = tonumber(ARGV[2])
if limit >= 0 and current + 1 > limit then
  if inflight > 0 then
    local prefix, cutoff = f .. '${RESERVATION_FIELD_SEPARATOR}', toint(ARGV[5])
    if not cutoff then return redis.error_reply('ERR live counter reservation timestamp is not an integer') end
    ${LUA_COLLECT_STALE_RESERVATION_FIELDS}
    local staleCount = #stale
    if staleCount > 0 then
      local reclaimedCurrent, reclaimedInflight = current - staleCount, inflight - staleCount
      if reclaimedCurrent < 0 or reclaimedInflight < 0 then
        return redis.error_reply('ERR live counter field is not an integer')
      end
      ${LUA_DELETE_STALE_RESERVATION_FIELDS}
      if reclaimedCurrent + 1 <= limit then
        redis.call('HSET', KEYS[1], f, reclaimedCurrent + 1, f .. '${INFLIGHT_FIELD_SUFFIX}', reclaimedInflight + 1, r, ARGV[4])
        return { 1, reclaimedCurrent + 1 }
      end
      redis.call('HSET', KEYS[1], f, reclaimedCurrent, f .. '${INFLIGHT_FIELD_SUFFIX}', reclaimedInflight)
      return { 0, reclaimedCurrent }
    end
  end
  return { 0, current }
end
redis.call('HSET', KEYS[1], f, current + 1, f .. '${INFLIGHT_FIELD_SUFFIX}', inflight + 1, r, ARGV[4])
return { 1, current + 1 }
`,
  touchReservation: `
${LUA_TOINT}
local r = ARGV[1] .. '${RESERVATION_FIELD_SEPARATOR}' .. ARGV[2]
local at = redis.call('HGET', KEYS[1], r)
if not at then return 0 end
if not toint(at) or not toint(ARGV[3]) then
  return redis.error_reply('ERR live counter reservation timestamp is not an integer')
end
redis.call('HSET', KEYS[1], r, ARGV[3])
return 1
`,
  settleReservation: `
${LUA_TOINT}
local f, r = ARGV[1], ARGV[1] .. '${RESERVATION_FIELD_SEPARATOR}' .. ARGV[2]
local v = redis.call('HMGET', KEYS[1], f .. '${INFLIGHT_FIELD_SUFFIX}', r)
if not v[2] then return 0 end
if not toint(v[2]) then return redis.error_reply('ERR live counter reservation timestamp is not an integer') end
local inflight = toint(v[1] or '0')
if not inflight then
  return redis.error_reply('ERR live counter field is not an integer')
end
local settled = toint(redis.call('HGET', KEYS[1], f .. '${SETTLED_FIELD_SUFFIX}') or '0')
if not settled then
  return redis.error_reply('ERR live counter field is not an integer')
end
redis.call('HDEL', KEYS[1], r)
redis.call('HSET', KEYS[1], f .. '${INFLIGHT_FIELD_SUFFIX}', inflight - 1, f .. '${SETTLED_FIELD_SUFFIX}', settled + 1)
return 1
`,
  releaseReservation: `
${LUA_TOINT}
local f, r = ARGV[1], ARGV[1] .. '${RESERVATION_FIELD_SEPARATOR}' .. ARGV[2]
local v = redis.call('HMGET', KEYS[1], f, f .. '${INFLIGHT_FIELD_SUFFIX}', r)
if not v[3] then return 0 end
if not toint(v[3]) then return redis.error_reply('ERR live counter reservation timestamp is not an integer') end
local current, inflight = toint(v[1] or '0'), toint(v[2] or '0')
if not current or not inflight then
  return redis.error_reply('ERR live counter field is not an integer')
end
redis.call('HDEL', KEYS[1], r)
redis.call('HSET', KEYS[1], f, current - 1, f .. '${INFLIGHT_FIELD_SUFFIX}', inflight - 1)
return 1
`,
  hsetWithInflight: `
${LUA_TOINT}
if ARGV[3] == 'setnx' and redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return -1 end
local base, delta = toint(ARGV[2]), 0
if not base then return redis.error_reply('ERR live counter field is not an integer') end
if ARGV[7] ~= '' then
  local settled = toint(redis.call('HGET', KEYS[1], ARGV[1] .. '${SETTLED_FIELD_SUFFIX}') or '0')
  local settledSince = toint(ARGV[7])
  if not settled or not settledSince then
    return redis.error_reply('ERR live counter field is not an integer')
  end
  if settled < settledSince then return -2 end
  delta = settled - settledSince
end
local prefix, cutoff = ARGV[1] .. '${RESERVATION_FIELD_SEPARATOR}', toint(ARGV[4])
if not cutoff then return redis.error_reply('ERR live counter reservation timestamp is not an integer') end
${LUA_COLLECT_STALE_RESERVATION_FIELDS}
${LUA_DELETE_STALE_RESERVATION_FIELDS}
local value = base + delta + survivingInflight
redis.call('HSET', KEYS[1], ARGV[1] .. '${INFLIGHT_FIELD_SUFFIX}', survivingInflight, ARGV[1], value)
if ARGV[5] ~= '' then redis.call('HSET', KEYS[1], ARGV[5], ARGV[6]) end
return value
`,
} as const

const RESERVE_STATUS_BY_CODE = {
  1: "reserved",
  0: "refused",
  [-1]: "missing",
} as const satisfies Record<-1 | 0 | 1, ReserveWithinLimitStatus>

const HSET_STATUS_BY_CODE = {
  [-1]: "exists",
  [-2]: "fenced",
} as const

type ReserveStatusCode = keyof typeof RESERVE_STATUS_BY_CODE
type HsetStatusCode = keyof typeof HSET_STATUS_BY_CODE

type LiveCounterClient = Redis & {
  reserveWithinLimit: (
    key: string,
    field: string,
    limit: string,
    reservationId: string,
    nowMs: string,
    pruneBeforeMs: string,
  ) => Promise<[status: ReserveStatusCode, value: number]>
  touchReservation: (
    key: string,
    field: string,
    reservationId: string,
    nowMs: string,
  ) => Promise<0 | 1>
  settleReservation: (
    key: string,
    field: string,
    reservationId: string,
  ) => Promise<0 | 1>
  releaseReservation: (
    key: string,
    field: string,
    reservationId: string,
  ) => Promise<0 | 1>
  hsetWithInflight: (
    key: string,
    field: string,
    base: string,
    mode: HsetWithInflightMode,
    pruneBeforeMs: string,
    extraField: string,
    extraValue: string,
    settledSince: string,
  ) => Promise<number>
}

const registeredClients = new WeakSet<Redis>()

function withLiveCounterScripts(client: Redis): LiveCounterClient {
  if (!registeredClients.has(client)) {
    for (const [name, lua] of Object.entries(liveCounterScripts)) {
      client.defineCommand(name, { numberOfKeys: 1, lua })
    }
    registeredClients.add(client)
  }
  return client as LiveCounterClient
}

export const liveCounterStoreFactory = (
  getRedisClient: () => Promise<Redis>,
) => ({
  async reserveWithinLimit(
    key: string,
    field: string,
    limit: number | null,
    reservationId: string,
  ): Promise<ReserveWithinLimitResult> {
    const client = withLiveCounterScripts(await getRedisClient())
    const nowMs = Date.now()
    const [status, value] = await client.reserveWithinLimit(
      key,
      field,
      String(limit ?? -1),
      reservationId,
      String(nowMs),
      String(nowMs - LIVE_RESERVATION_MAX_AGE_MS),
    )
    return { status: RESERVE_STATUS_BY_CODE[status], value }
  },

  async touchReservation(
    key: string,
    field: string,
    reservationId: string,
  ): Promise<boolean> {
    const client = withLiveCounterScripts(await getRedisClient())
    return (
      (await client.touchReservation(
        key,
        field,
        reservationId,
        String(Date.now()),
      )) === 1
    )
  },

  async settleReservation(
    key: string,
    field: string,
    reservationId: string,
  ): Promise<boolean> {
    const client = withLiveCounterScripts(await getRedisClient())
    return (await client.settleReservation(key, field, reservationId)) === 1
  },

  async releaseReservation(
    key: string,
    field: string,
    reservationId: string,
  ): Promise<boolean> {
    const client = withLiveCounterScripts(await getRedisClient())
    return (await client.releaseReservation(key, field, reservationId)) === 1
  },

  async hsetWithInflight(
    key: string,
    field: string,
    base: number,
    mode: HsetWithInflightMode,
    options?: {
      extra?: { field: string; value: string }
      settledSince?: number
    },
  ): Promise<HsetWithInflightResult> {
    const client = withLiveCounterScripts(await getRedisClient())
    const code = await client.hsetWithInflight(
      key,
      field,
      String(base),
      mode,
      String(Date.now() - LIVE_RESERVATION_MAX_AGE_MS),
      options?.extra?.field ?? "",
      options?.extra?.value ?? "",
      options?.settledSince === undefined ? "" : String(options.settledSince),
    )
    const status = HSET_STATUS_BY_CODE[code as HsetStatusCode]
    return status ? { status } : { status: "written", value: code }
  },
})
