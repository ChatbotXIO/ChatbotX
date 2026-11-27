import logger from "@chatbotx.io/logger"
import type Redis from "ioredis"
import superjson from "superjson"
import { cacheConnections } from "./connections/cache-connection"

export type ReadCacheOptions = {
  /** Consumer-unique and payload-versioned, e.g. "template-store:v1"; bump the suffix when the payload shape changes. */
  namespace: string
  /** Hygiene bound only; correctness comes from the version. */
  ttlMs: number
  /** Entries whose encoded size is above this are returned but not stored. */
  maxEntryBytes: number
  /** Per Redis call; a timeout counts as a miss. */
  redisTimeoutMs: number
  /** In-process tier, bounded by encoded bytes (an accounting bound, not exact heap usage). */
  memory?: { maxBytes: number }
}

/** `version` is a canonical non-negative decimal string (a PostgreSQL bigint). */
export type VersionedValue<T> = { version: string; value: T }

/** Recursively readonly; Date and functions are kept as-is. */
export type DeepReadonly<T> = T extends
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | ((...args: never[]) => unknown)
  ? T
  : T extends ReadonlyMap<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlySet<infer U>
      ? ReadonlySet<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T

export type ReadCache<T> = {
  /**
   * The returned value is shared by every caller and by the memory tier: it
   * must never be mutated (the type is readonly, nothing is frozen at runtime).
   *
   * Returns the cached value whose version equals `version`; otherwise calls `load` once.
   * `load` returns the version its data reflects, which may be newer than `version`;
   * the value is stored, and returned, under that version.
   */
  getOrLoad(input: {
    scope: string
    entry: string
    version: string
    load: () => Promise<VersionedValue<T>>
    /**
     * Rejects a stored value that cannot be right for this scope (for example a
     * key bug). A memory or Redis value failing it is dropped and treated as a
     * miss, so `load` runs and its result replaces the bad entry; a value the
     * loader itself returns failing it throws.
     * It must depend only on `(scope, entry)`: callers that share a single-flight
     * share one check, so a waiter never applies its own predicate.
     */
    accept?: (value: DeepReadonly<T>) => boolean
  }): Promise<VersionedValue<DeepReadonly<T>>>
}

type Accept<T> = (value: DeepReadonly<T>) => boolean

type CacheIds = {
  key: string
  redisKey: string
  scope: string
  entry: string
}

type MemoryEntry<T> = {
  version: string
  value: T
  bytes: number
  expiresAt: number
}

const CANONICAL_VERSION = /^(0|[1-9][0-9]*)$/

/**
 * Compare-and-set: write unless the stored version is strictly newer. An equal
 * version is rewritten: the same version means the same data, so this repairs a
 * corrupt payload stored at the current version. Versions are compared by length then lexicographically,
 * which is exact for int64 (Lua `tonumber` is a double and loses precision above 2^53).
 */
const READ_CACHE_SET_IF_NEWER = `
local current = redis.call('HGET', KEYS[1], 'v')
local incoming = ARGV[1]
if current and (current == '0' or string.match(current, '^[1-9][0-9]*$')) then
  if #current > #incoming or (#current == #incoming and current > incoming) then
    return 0
  end
end
redis.call('HSET', KEYS[1], 'v', incoming, 'd', ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`

type ReadCacheClient = Redis & {
  readCacheSetIfNewer: (
    key: string,
    version: string,
    payload: string,
    ttlMs: string,
  ) => Promise<0 | 1>
}

const registeredClients = new WeakSet<Redis>()

const withReadCacheScript = (client: Redis): ReadCacheClient => {
  if (!registeredClients.has(client)) {
    client.defineCommand("readCacheSetIfNewer", {
      numberOfKeys: 1,
      lua: READ_CACHE_SET_IF_NEWER,
    })
    registeredClients.add(client)
  }
  return client as ReadCacheClient
}

// The one place mutable `T` becomes `DeepReadonly<T>`: a type-level contract only.
const asReadonly = <T>(
  versioned: VersionedValue<T>,
): VersionedValue<DeepReadonly<T>> =>
  versioned as unknown as VersionedValue<DeepReadonly<T>>

const assertVersion = (version: string, what: string): void => {
  if (!CANONICAL_VERSION.test(version)) {
    throw new Error(
      `read-cache: ${what} version must be a canonical non-negative decimal string, got ${JSON.stringify(version)}`,
    )
  }
}

/** True when `candidate` is strictly greater than `current` (canonical decimals). */
const isNewerVersion = (candidate: string, current: string): boolean =>
  candidate.length === current.length
    ? candidate > current
    : candidate.length > current.length

const utf8Bytes = (text: string): number =>
  new TextEncoder().encode(text).length

const withTimeout = async <R>(
  timeoutMs: number,
  run: () => Promise<R>,
): Promise<R> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`read-cache: Redis call timed out after ${timeoutMs}ms`),
        ),
      timeoutMs,
    )
  })
  const call = run()
  // The losing promise must never surface as an unhandled rejection.
  call.catch(() => undefined)
  try {
    return await Promise.race([call, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export const createReadCacheWith = <T>(
  getRedisClient: () => Promise<Redis>,
  options: ReadCacheOptions,
): ReadCache<T> => {
  const { namespace, ttlMs, maxEntryBytes, redisTimeoutMs, memory } = options
  const memoryEntries = new Map<string, MemoryEntry<T>>()
  const flights = new Map<string, Promise<VersionedValue<T>>>()
  let memoryBytes = 0

  const entryKey = (scope: string, entry: string): string =>
    `${encodeURIComponent(scope)}:${encodeURIComponent(entry)}`

  const dropMemory = (key: string): void => {
    const existing = memoryEntries.get(key)
    if (existing) {
      memoryBytes -= existing.bytes
      memoryEntries.delete(key)
    }
  }

  const isAccepted = (accept: Accept<T> | undefined, value: T): boolean =>
    accept === undefined || accept(value as unknown as DeepReadonly<T>)

  const readMemory = (
    key: string,
    version: string,
    accept: Accept<T> | undefined,
  ): T | undefined => {
    const existing = memoryEntries.get(key)
    if (!existing) {
      return
    }
    if (existing.expiresAt <= Date.now()) {
      dropMemory(key)
      return
    }
    if (existing.version !== version) {
      return
    }
    if (!isAccepted(accept, existing.value)) {
      logger.warn(
        { namespace, key },
        "Read cache memory entry rejected by accept, reloading",
      )
      dropMemory(key)
      return
    }
    // Refresh recency.
    memoryEntries.delete(key)
    memoryEntries.set(key, existing)
    return existing.value
  }

  const writeMemory = (
    key: string,
    entry: VersionedValue<T>,
    bytes: number,
  ) => {
    if (!memory || bytes > memory.maxBytes) {
      return
    }
    const now = Date.now()
    // No timers (Edge/serverless): expired entries are swept on every write.
    for (const [expiredKey, candidate] of memoryEntries) {
      if (candidate.expiresAt <= now) {
        dropMemory(expiredKey)
      }
    }
    const existing = memoryEntries.get(key)
    if (existing && !isNewerVersion(entry.version, existing.version)) {
      return
    }
    dropMemory(key)
    memoryEntries.set(key, {
      version: entry.version,
      value: entry.value,
      bytes,
      expiresAt: Date.now() + ttlMs,
    })
    memoryBytes += bytes
    for (const [oldest] of memoryEntries) {
      if (memoryBytes <= memory.maxBytes) {
        break
      }
      dropMemory(oldest)
    }
  }

  const readRedis = async (
    ids: CacheIds,
    version: string,
    accept: Accept<T> | undefined,
  ): Promise<{ value: T; bytes: number } | undefined> => {
    try {
      const [storedVersion, payload] = await withTimeout(
        redisTimeoutMs,
        async () => (await getRedisClient()).hmget(ids.redisKey, "v", "d"),
      )
      if (storedVersion !== version || typeof payload !== "string") {
        return
      }
      // Size gate before parsing: an oversized payload (written by an older
      // build or by hand) would otherwise be parsed on every hit and then
      // enter memory. A UTF-16 length above the cap already means more bytes.
      const bytes =
        payload.length > maxEntryBytes ? payload.length : utf8Bytes(payload)
      if (bytes > maxEntryBytes) {
        logger.debug(
          {
            namespace,
            scope: ids.scope,
            entry: ids.entry,
            bytes,
            maxEntryBytes,
          },
          "Read cache Redis entry exceeds maxEntryBytes, treating as miss",
        )
        return
      }
      const value = superjson.parse<T>(payload)
      if (!isAccepted(accept, value)) {
        logger.warn(
          { namespace, redisKey: ids.redisKey },
          "Read cache Redis entry rejected by accept, reloading",
        )
        return
      }
      return { value, bytes }
    } catch (err) {
      logger.debug(
        { err, redisKey: ids.redisKey },
        "Read cache Redis read failed, treating as miss",
      )
      return
    }
  }

  const writeRedis = async (
    redisKey: string,
    version: string,
    payload: string,
  ): Promise<void> => {
    try {
      await withTimeout(redisTimeoutMs, async () => {
        const client = withReadCacheScript(await getRedisClient())
        return await client.readCacheSetIfNewer(
          redisKey,
          version,
          payload,
          String(ttlMs),
        )
      })
    } catch (err) {
      logger.debug({ err, redisKey }, "Read cache Redis write failed, ignoring")
    }
  }

  // Awaited so the next request sees the entry; bounded by redisTimeoutMs and
  // paid only on a miss that already cost a database load.
  const store = async (
    ids: CacheIds,
    loaded: VersionedValue<T>,
  ): Promise<void> => {
    const { key, redisKey, scope, entry } = ids
    const payload = superjson.stringify(loaded.value)
    const bytes = utf8Bytes(payload)
    if (bytes > maxEntryBytes) {
      logger.warn(
        { namespace, scope, entry, bytes, maxEntryBytes },
        "Read cache entry exceeds maxEntryBytes and is not cached",
      )
      return
    }
    writeMemory(key, loaded, bytes)
    await writeRedis(redisKey, loaded.version, payload)
  }

  const fill = async (
    ids: CacheIds,
    version: string,
    load: () => Promise<VersionedValue<T>>,
    accept: Accept<T> | undefined,
  ): Promise<VersionedValue<T>> => {
    const { key } = ids
    const fromRedis = await readRedis(ids, version, accept)
    if (fromRedis) {
      writeMemory(key, { version, value: fromRedis.value }, fromRedis.bytes)
      return { version, value: fromRedis.value }
    }
    const loaded = await load()
    assertVersion(loaded.version, "loaded")
    if (!isAccepted(accept, loaded.value)) {
      throw new Error(
        `read-cache: the loader returned a value rejected by accept (namespace ${namespace}, scope ${ids.scope}, entry ${ids.entry})`,
      )
    }
    await store(ids, loaded)
    return loaded
  }

  return {
    async getOrLoad({ scope, entry, version, load, accept }) {
      assertVersion(version, "requested")
      const key = entryKey(scope, entry)
      const cached = readMemory(key, version, accept)
      if (cached !== undefined) {
        return asReadonly({ version, value: cached })
      }
      const flightKey = `${key}@${version}`
      const running = flights.get(flightKey)
      if (running) {
        return asReadonly(await running)
      }
      const ids = { key, redisKey: `${namespace}:${key}`, scope, entry }
      const flight = fill(ids, version, load, accept).finally(() =>
        flights.delete(flightKey),
      )
      flights.set(flightKey, flight)
      return asReadonly(await flight)
    },
  }
}

export const createReadCache = <T>(options: ReadCacheOptions): ReadCache<T> =>
  createReadCacheWith<T>(cacheConnections.useExisting, options)
