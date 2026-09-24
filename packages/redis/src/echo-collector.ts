import { createHash } from "node:crypto"
import type Redis from "ioredis"

const ECHO_COLLECTOR_PREFIX = "echo-collector"
const SCAN_COUNT = 100

const PUSH_LUA = `
local currentItems = redis.call('LLEN', KEYS[1])
local currentBytes = tonumber(redis.call('GET', KEYS[2]) or '0')
local item = ARGV[1]
local itemBytes = string.len(item)
local maxItems = tonumber(ARGV[2])
local maxBytes = tonumber(ARGV[3])
local ttlSeconds = tonumber(ARGV[4])

if currentItems >= maxItems then
  return { 0, currentItems, currentBytes }
end

if currentBytes + itemBytes > maxBytes then
  return { -1, currentItems, currentBytes }
end

local nextItems = redis.call('RPUSH', KEYS[1], item)
local nextBytes = redis.call('INCRBY', KEYS[2], itemBytes)
redis.call('EXPIRE', KEYS[1], ttlSeconds, 'NX')
redis.call('EXPIRE', KEYS[2], ttlSeconds, 'NX')
return { 1, nextItems, nextBytes }
`

const PEEK_LUA = `
local count = tonumber(ARGV[1])
local processingTtlSeconds = tonumber(ARGV[2])
local processingTtlMs = processingTtlSeconds * 1000
local listTtlMs = redis.call('PTTL', KEYS[1])
local byteTtlMs = redis.call('PTTL', KEYS[2])

if listTtlMs >= 0 and listTtlMs < processingTtlMs then
  redis.call('EXPIRE', KEYS[1], processingTtlSeconds)
end

if byteTtlMs >= 0 and byteTtlMs < processingTtlMs then
  redis.call('EXPIRE', KEYS[2], processingTtlSeconds)
end

if count <= 0 then
  return {}
end

return redis.call('LRANGE', KEYS[1], 0, count - 1)
`

const ACK_LUA = `
local count = tonumber(ARGV[1])
local expectedDigest = ARGV[2]
local removed = redis.call('LRANGE', KEYS[1], 0, count - 1)
local joined = table.concat(removed, string.char(0))

if redis.sha1hex(joined) ~= expectedDigest then
  return -1
end

local removedBytes = 0

for _, item in ipairs(removed) do
  removedBytes = removedBytes + string.len(item)
end

redis.call('LTRIM', KEYS[1], count, -1)
local remainingItems = redis.call('LLEN', KEYS[1])

if remainingItems == 0 then
  redis.call('DEL', KEYS[2])
else
  local currentBytes = tonumber(redis.call('GET', KEYS[2]) or '0')
  local remainingBytes = math.max(0, currentBytes - removedBytes)
  redis.call('SET', KEYS[2], remainingBytes, 'KEEPTTL')
end

return remainingItems
`

export type EchoCollectorScope = {
  channel: string
  identifier: string
}

export type EchoCollectorLimits = {
  maxItems: number
  maxBytes: number
  ttlSeconds: number
}

export type EchoCollectorPushResult =
  | { accepted: true; size: number; bytes: number }
  | {
      accepted: false
      reason: "maxItems" | "maxBytes"
      size: number
      bytes: number
    }

export type EchoCollectorPeekResult<T> = {
  items: T[]
  malformedCount: number
  digest: string
}

export type EchoCollectorPeekOptions = {
  processingTtlSeconds: number
}

type PushCommandResult = [status: number, size: number, bytes: number]

type EchoCollectorClient = Redis & {
  echoCollectorPush: (
    listKey: string,
    byteKey: string,
    item: string,
    maxItems: string,
    maxBytes: string,
    ttlSeconds: string,
  ) => Promise<PushCommandResult>
  echoCollectorAck: (
    listKey: string,
    byteKey: string,
    count: string,
    digest: string,
  ) => Promise<number>
  echoCollectorPeek: (
    listKey: string,
    byteKey: string,
    count: string,
    processingTtlSeconds: string,
  ) => Promise<string[]>
}

const clientsWithEchoCollectorCommands = new WeakSet<Redis>()

function withEchoCollectorCommands(client: Redis): EchoCollectorClient {
  if (!clientsWithEchoCollectorCommands.has(client)) {
    client.defineCommand("echoCollectorPush", {
      numberOfKeys: 2,
      lua: PUSH_LUA,
    })
    client.defineCommand("echoCollectorPeek", {
      numberOfKeys: 2,
      lua: PEEK_LUA,
    })
    client.defineCommand("echoCollectorAck", {
      numberOfKeys: 2,
      lua: ACK_LUA,
    })
    clientsWithEchoCollectorCommands.add(client)
  }
  return client as EchoCollectorClient
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function decodeKeyPart(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function echoCollectorKeys(scope: EchoCollectorScope): {
  listKey: string
  byteKey: string
  flagKey: string
} {
  const suffix = `{${encodeKeyPart(scope.channel)}:${encodeKeyPart(scope.identifier)}}`
  return {
    listKey: `${ECHO_COLLECTOR_PREFIX}:list:${suffix}`,
    byteKey: `${ECHO_COLLECTOR_PREFIX}:bytes:${suffix}`,
    flagKey: `${ECHO_COLLECTOR_PREFIX}:flag:${suffix}`,
  }
}

export const echoCollectorFactory = (getRedisClient: () => Promise<Redis>) => ({
  async push<T extends Record<string, unknown>>(
    scope: EchoCollectorScope,
    item: T,
    limits: EchoCollectorLimits,
  ): Promise<EchoCollectorPushResult> {
    const redisClient = withEchoCollectorCommands(await getRedisClient())
    const { listKey, byteKey } = echoCollectorKeys(scope)
    const [status, size, bytes] = await redisClient.echoCollectorPush(
      listKey,
      byteKey,
      JSON.stringify(item),
      String(limits.maxItems),
      String(limits.maxBytes),
      String(limits.ttlSeconds),
    )

    if (status === 1) {
      return { accepted: true, size, bytes }
    }
    return {
      accepted: false,
      reason: status === 0 ? "maxItems" : "maxBytes",
      size,
      bytes,
    }
  },

  async peek<T>(
    scope: EchoCollectorScope,
    count: number,
    options: EchoCollectorPeekOptions,
  ): Promise<EchoCollectorPeekResult<T>> {
    const redisClient = withEchoCollectorCommands(await getRedisClient())
    const { listKey, byteKey } = echoCollectorKeys(scope)
    const storedItems = await redisClient.echoCollectorPeek(
      listKey,
      byteKey,
      String(count),
      String(options.processingTtlSeconds),
    )
    const items: T[] = []
    let malformedCount = 0

    for (const storedItem of storedItems) {
      try {
        const parsed: unknown = JSON.parse(storedItem)
        if (
          parsed === null ||
          typeof parsed !== "object" ||
          Array.isArray(parsed)
        ) {
          malformedCount += 1
          continue
        }
        items.push(parsed as T)
      } catch {
        malformedCount += 1
      }
    }

    const digest = createHash("sha1")
      .update(storedItems.join("\u0000"))
      .digest("hex")

    return { items, malformedCount, digest }
  },

  async ack(
    scope: EchoCollectorScope,
    count: number,
    digest: string,
  ): Promise<number> {
    const redisClient = withEchoCollectorCommands(await getRedisClient())
    const { listKey, byteKey } = echoCollectorKeys(scope)
    if (count <= 0) {
      return await redisClient.llen(listKey)
    }
    return await redisClient.echoCollectorAck(
      listKey,
      byteKey,
      String(count),
      digest,
    )
  },

  async size(scope: EchoCollectorScope): Promise<number> {
    const redisClient = await getRedisClient()
    return await redisClient.llen(echoCollectorKeys(scope).listKey)
  },

  async schedule(scope: EchoCollectorScope, ttlMs: number): Promise<boolean> {
    const redisClient = await getRedisClient()
    const result = await redisClient.set(
      echoCollectorKeys(scope).flagKey,
      "1",
      "PX",
      ttlMs,
      "NX",
    )
    return result === "OK"
  },

  async clearFlag(scope: EchoCollectorScope): Promise<void> {
    const redisClient = await getRedisClient()
    await redisClient.del(echoCollectorKeys(scope).flagKey)
  },

  async *scanPending(
    channel: string,
  ): AsyncGenerator<EchoCollectorScope, void, undefined> {
    const redisClient = await getRedisClient()
    const encodedChannel = encodeKeyPart(channel)
    const keyPrefix = `${ECHO_COLLECTOR_PREFIX}:list:{${encodedChannel}:`
    let cursor = "0"

    do {
      const [nextCursor, keys] = await redisClient.scan(
        cursor,
        "MATCH",
        `${keyPrefix}*`,
        "COUNT",
        SCAN_COUNT,
      )
      cursor = nextCursor

      for (const listKey of keys) {
        if ((await redisClient.llen(listKey)) === 0) {
          continue
        }
        if (!listKey.endsWith("}")) {
          continue
        }
        const identifier = decodeKeyPart(
          listKey.slice(keyPrefix.length, listKey.length - 1),
        )
        if (identifier !== null) {
          yield { channel, identifier }
        }
      }
    } while (cursor !== "0")
  },
})

export type EchoCollector = ReturnType<typeof echoCollectorFactory>
