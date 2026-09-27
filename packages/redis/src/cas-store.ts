import type Redis from "ioredis"

/**
 * Server-side Redis (Lua) script: atomically swaps a JSON record only when
 * every field in expected matches the CURRENT value at KEYS[1], read and
 * compared inside Redis itself. expected === "" means the key must not
 * currently exist (create-only swap). Registered once per client via
 * defineCommand, mirroring distributed-store.ts's pattern.
 */
const COMPARE_AND_SWAP_JSON_LUA = `
local current = redis.call('GET', KEYS[1])
local expectedJson = ARGV[1]
local nextJson = ARGV[2]
local ttlMs = tonumber(ARGV[3])

if expectedJson == '' then
  if current then return 0 end
else
  if not current then return 0 end
  local decodedCurrent = cjson.decode(current)
  local expected = cjson.decode(expectedJson)
  for field, value in pairs(expected) do
    if decodedCurrent[field] ~= value then
      return 0
    end
  end
end

redis.call('SET', KEYS[1], nextJson, 'PX', ttlMs)
return 1
`

const COMPARE_AND_DELETE_JSON_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end

local decodedCurrent = cjson.decode(current)
local expected = cjson.decode(ARGV[1])
for field, value in pairs(expected) do
  if decodedCurrent[field] ~= value then
    return 0
  end
end

redis.call('DEL', KEYS[1])
return 1
`

type CompareAndSwapClient = Redis & {
  compareAndSwapJson: (
    key: string,
    expectedJson: string,
    nextJson: string,
    ttlMs: string,
  ) => Promise<number>
}

type CompareAndDeleteClient = Redis & {
  compareAndDeleteJson: (key: string, expectedJson: string) => Promise<number>
}

const clientsWithCompareAndSwap = new WeakSet<Redis>()

function withCompareAndSwap(client: Redis): CompareAndSwapClient {
  if (!clientsWithCompareAndSwap.has(client)) {
    client.defineCommand("compareAndSwapJson", {
      numberOfKeys: 1,
      lua: COMPARE_AND_SWAP_JSON_LUA,
    })
    clientsWithCompareAndSwap.add(client)
  }
  return client as CompareAndSwapClient
}

const clientsWithCompareAndDelete = new WeakSet<Redis>()

function withCompareAndDelete(client: Redis): CompareAndDeleteClient {
  if (!clientsWithCompareAndDelete.has(client)) {
    client.defineCommand("compareAndDeleteJson", {
      numberOfKeys: 1,
      lua: COMPARE_AND_DELETE_JSON_LUA,
    })
    clientsWithCompareAndDelete.add(client)
  }
  return client as CompareAndDeleteClient
}

/**
 * Channel-agnostic key + JSON + compare-and-set primitive. Knows nothing about
 * the caller's domain — a thin, reusable layer over SET … PX … NX and a Lua
 * CAS, in the same factory style as bloom-filter/distributed-store.
 * Callers express a state-machine transition as "apply next only if the fields
 * in expected still match the stored value" via compareAndSwap.
 */
export const casStoreFactory = (getRedisClient: () => Promise<Redis>) => ({
  /**
   * SET key value PX ttlMs NX — writes only if the key is absent. The first
   * writer wins permanently for the TTL window; a redelivered write with the
   * same key can neither overwrite the value nor extend the TTL.
   */
  async setIfAbsent<T>(key: string, value: T, ttlMs: number): Promise<boolean> {
    const redisClient = await getRedisClient()
    const result = await redisClient.set(
      key,
      JSON.stringify(value),
      "PX",
      ttlMs,
      "NX",
    )
    return result === "OK"
  },

  /** Raw string read — null when the key is absent. */
  async get(key: string): Promise<string | null> {
    const redisClient = await getRedisClient()
    return await redisClient.get(key)
  },

  async del(key: string): Promise<void> {
    const redisClient = await getRedisClient()
    await redisClient.del(key)
  },

  /**
   * JSON-typed read — null when absent or when the stored value is not valid
   * JSON.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const redisClient = await getRedisClient()
    const raw = await redisClient.get(key)
    if (raw === null) {
      return null
    }
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },

  /**
   * Atomically overwrites the JSON record at key with next, but only if every
   * field present in expected still matches the record currently stored
   * (checked inside a single Redis Lua call, so no other writer can
   * interleave). Pass expected: null to require the key be absent. Returns
   * whether the swap applied.
   */
  async compareAndSwap<T extends Record<string, unknown>>(
    key: string,
    expected: Partial<T> | null,
    next: T,
    ttlMs: number,
  ): Promise<boolean> {
    const redisClient = withCompareAndSwap(await getRedisClient())
    const expectedJson = expected === null ? "" : JSON.stringify(expected)
    const result = await redisClient.compareAndSwapJson(
      key,
      expectedJson,
      JSON.stringify(next),
      String(ttlMs),
    )
    return result === 1
  },

  /**
   * Atomically deletes the JSON record at key only if every field present in
   * expected still matches the record currently stored. Returns whether the
   * delete applied.
   */
  async compareAndDelete<T extends Record<string, unknown>>(
    key: string,
    expected: Partial<T>,
  ): Promise<boolean> {
    const redisClient = withCompareAndDelete(await getRedisClient())
    const result = await redisClient.compareAndDeleteJson(
      key,
      JSON.stringify(expected),
    )
    return result === 1
  },
})

export type CasStore = ReturnType<typeof casStoreFactory>
