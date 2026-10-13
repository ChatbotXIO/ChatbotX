import type Redis from "ioredis"

/**
 * Redis copy of a leaderboard's ranking. Postgres (`LeaderboardParticipant`)
 * is the source of truth; everything here is rebuildable and may disappear
 * (eviction, flush) — a missing `rank` key means "not built", never "empty".
 *
 * Memory is kept to ONE entry per participant: daily caps, cooldown and
 * redelivery dedup live in Postgres, profiles are read from Postgres for the
 * Top N only. Keys exist only while a leaderboard is active/paused and carry a
 * TTL that is refreshed on every write.
 *
 * Rank value = score * 1e8 + (99_999_999 - secondsSinceStart): higher score
 * first, then whoever reached it earlier. It is a double, exact below 2^53, so
 * score must stay below 90M and a leaderboard shorter than ~3.17 years
 * (`LEADERBOARD_MAX_SCORE` / `LEADERBOARD_MAX_DURATION_SECONDS` in the
 * database partials enforce both).
 */

const TIE_SCALE = 100_000_000
const TIE_MAX = TIE_SCALE - 1
/** Keeps an empty-but-built ranking distinguishable from a missing key. */
const SENTINEL_MEMBER = "_"
const KEY_TTL_SECONDS = 30 * 24 * 60 * 60
const USED_MEMORY_PATTERN = /used_memory:(\d+)/

export const leaderboardKeys = (leaderboardId: string) => ({
  rank: `lb:${leaderboardId}:rank`,
  stats: `lb:${leaderboardId}:stats`,
  top: `lb:${leaderboardId}:top`,
  rebuild: `lb:${leaderboardId}:rank:rebuild`,
})

export const tieSecondsSince = (startsAt: Date, at: Date): number =>
  Math.min(
    TIE_MAX,
    Math.max(0, Math.floor((at.getTime() - startsAt.getTime()) / 1000)),
  )

export const encodeRankValue = (score: number, tieSeconds: number): number =>
  score * TIE_SCALE + (TIE_MAX - tieSeconds)

export const decodeRankValue = (value: number): number =>
  Math.floor(value / TIE_SCALE)

/**
 * Adds `delta` to a member atomically and returns the new score, or -1 when
 * the ranking is not built (the caller then leaves it to the next rebuild).
 * Applying deltas (not absolute values) makes concurrent updates commute, so
 * no per-member version is stored. The tie part keeps the LATEST change time
 * (smallest inverted value).
 *
 * KEYS: rank, stats
 * ARGV: member, delta, tieSeconds, isNew (0/1), newTodayField, ttlSeconds, maxScore
 */
const APPLY_DELTA_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
local member = ARGV[1]
local delta = tonumber(ARGV[2])
local newInv = ${TIE_MAX} - tonumber(ARGV[3])
local maxScore = tonumber(ARGV[7])
local oldScore = 0
local oldInv = nil
local current = redis.call('ZSCORE', KEYS[1], member)
if current then
  local value = tonumber(current)
  oldInv = value % ${TIE_SCALE}
  oldScore = (value - oldInv) / ${TIE_SCALE}
end
local newScore = oldScore + delta
if newScore < 0 then newScore = 0 end
if newScore > maxScore then newScore = maxScore end
local inv = newInv
if oldInv and (delta == 0 or oldInv < newInv) then inv = oldInv end
redis.call('ZADD', KEYS[1], string.format('%.0f', newScore * ${TIE_SCALE} + inv), member)
redis.call('HINCRBY', KEYS[2], 'totalPoints', newScore - oldScore)
if ARGV[4] == '1' then
  redis.call('HINCRBY', KEYS[2], 'participants', 1)
  redis.call('HINCRBY', KEYS[2], ARGV[5], 1)
end
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[6]))
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[6]))
return newScore
`

/**
 * Sets one member to an absolute value (unban). No-op when not built.
 * KEYS: rank — ARGV: member, value
 */
const SET_IF_BUILT_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
return 1
`

type LeaderboardCommandsClient = Redis & {
  leaderboardApplyDelta: (
    rankKey: string,
    statsKey: string,
    member: string,
    delta: string,
    tieSeconds: string,
    isNew: string,
    newTodayField: string,
    ttlSeconds: string,
    maxScore: string,
  ) => Promise<number>
  leaderboardSetIfBuilt: (
    rankKey: string,
    member: string,
    value: string,
  ) => Promise<number>
}

const registeredClients = new WeakSet<Redis>()

function withLeaderboardCommands(client: Redis): LeaderboardCommandsClient {
  if (!registeredClients.has(client)) {
    client.defineCommand("leaderboardApplyDelta", {
      numberOfKeys: 2,
      lua: APPLY_DELTA_LUA,
    })
    client.defineCommand("leaderboardSetIfBuilt", {
      numberOfKeys: 1,
      lua: SET_IF_BUILT_LUA,
    })
    registeredClients.add(client)
  }
  return client as LeaderboardCommandsClient
}

export type LeaderboardRankEntry = { contactId: string; score: number }

export type LeaderboardStats = {
  participants: number
  totalPoints: number
  newToday: number
}

const newTodayField = (dayKey: string) => `new:${dayKey}`

const parseStats = (
  hash: Record<string, string>,
  dayKey: string,
): LeaderboardStats | null => {
  if (Object.keys(hash).length === 0) {
    return null
  }
  return {
    participants: Number(hash.participants ?? 0),
    totalPoints: Number(hash.totalPoints ?? 0),
    newToday: Number(hash[newTodayField(dayKey)] ?? 0),
  }
}

export const leaderboardStoreFactory = (
  getRedisClient: () => Promise<Redis>,
) => ({
  /**
   * Applies a committed score change. Returns the new score, or null when the
   * ranking is not built (nothing written — the next read rebuilds it).
   */
  async applyDelta(input: {
    leaderboardId: string
    contactId: string
    delta: number
    tieSeconds: number
    isNew: boolean
    dayKey: string
    maxScore: number
  }): Promise<number | null> {
    const keys = leaderboardKeys(input.leaderboardId)
    const client = withLeaderboardCommands(await getRedisClient())
    const result = await client.leaderboardApplyDelta(
      keys.rank,
      keys.stats,
      input.contactId,
      String(input.delta),
      String(input.tieSeconds),
      input.isNew ? "1" : "0",
      newTodayField(input.dayKey),
      String(KEY_TTL_SECONDS),
      String(input.maxScore),
    )
    return result < 0 ? null : Number(result)
  },

  /** Puts a member back with an absolute value (unban); no-op when not built. */
  async setMember(input: {
    leaderboardId: string
    contactId: string
    score: number
    tieSeconds: number
  }): Promise<void> {
    const client = withLeaderboardCommands(await getRedisClient())
    await client.leaderboardSetIfBuilt(
      leaderboardKeys(input.leaderboardId).rank,
      input.contactId,
      String(encodeRankValue(input.score, input.tieSeconds)),
    )
  },

  async removeMember(leaderboardId: string, contactId: string): Promise<void> {
    const client = await getRedisClient()
    await client.zrem(leaderboardKeys(leaderboardId).rank, contactId)
  },

  /** Top `limit` entries, or null when the ranking is not built. */
  async top(
    leaderboardId: string,
    limit: number,
    offset = 0,
  ): Promise<LeaderboardRankEntry[] | null> {
    const client = await getRedisClient()
    const raw = await client.zrange(
      leaderboardKeys(leaderboardId).rank,
      offset,
      offset + limit,
      "REV",
      "WITHSCORES",
    )
    if (raw.length === 0) {
      return offset === 0 ? null : []
    }
    const entries: LeaderboardRankEntry[] = []
    for (let i = 0; i < raw.length; i += 2) {
      const member = raw[i] as string
      if (member === SENTINEL_MEMBER) {
        continue
      }
      entries.push({
        contactId: member,
        score: decodeRankValue(Number(raw[i + 1])),
      })
    }
    return entries.slice(0, limit)
  },

  /**
   * 1-based rank and score per contact in one round-trip. `built` is false
   * when the ranking does not exist; an unranked contact maps to null.
   */
  async ranksOf(
    leaderboardId: string,
    contactIds: string[],
  ): Promise<{
    built: boolean
    ranks: Map<string, { rank: number; score: number } | null>
  }> {
    const client = await getRedisClient()
    const key = leaderboardKeys(leaderboardId).rank
    const pipeline = client.pipeline().exists(key)
    for (const contactId of contactIds) {
      pipeline.zrevrank(key, contactId).zscore(key, contactId)
    }
    const results = (await pipeline.exec()) ?? []
    const built = Number(results[0]?.[1] ?? 0) === 1
    const ranks = new Map<string, { rank: number; score: number } | null>()
    contactIds.forEach((contactId, index) => {
      const rank = results[1 + index * 2]?.[1] as number | null | undefined
      const score = results[2 + index * 2]?.[1] as string | null | undefined
      ranks.set(
        contactId,
        rank === null ||
          rank === undefined ||
          score === null ||
          score === undefined
          ? null
          : { rank: Number(rank) + 1, score: decodeRankValue(Number(score)) },
      )
    })
    return { built, ranks }
  },

  /** Live counters for many leaderboards in one round-trip; null entries are not built. */
  async statsMany(
    leaderboardIds: string[],
    dayKey: string,
  ): Promise<Map<string, LeaderboardStats | null>> {
    const result = new Map<string, LeaderboardStats | null>()
    if (leaderboardIds.length === 0) {
      return result
    }
    const client = await getRedisClient()
    const pipeline = client.pipeline()
    for (const id of leaderboardIds) {
      pipeline.hgetall(leaderboardKeys(id).stats)
    }
    const rows = (await pipeline.exec()) ?? []
    leaderboardIds.forEach((id, index) => {
      const hash = (rows[index]?.[1] ?? {}) as Record<string, string>
      result.set(id, parseStats(hash, dayKey))
    })
    return result
  },

  /**
   * Replaces the ranking with the rows produced by `pages` (already ordered),
   * built under a temporary key and swapped in with one RENAME so readers
   * never see a half-built set. Also replaces the stats hash.
   */
  async replaceRanking(input: {
    leaderboardId: string
    pages:
      | AsyncIterable<{ contactId: string; value: number }[]>
      | Iterable<{ contactId: string; value: number }[]>
    stats: LeaderboardStats
    dayKey: string
  }): Promise<number> {
    const client = await getRedisClient()
    const keys = leaderboardKeys(input.leaderboardId)
    await client.del(keys.rebuild)
    await client.zadd(keys.rebuild, "-inf", SENTINEL_MEMBER)
    let total = 0
    for await (const page of input.pages) {
      if (page.length === 0) {
        continue
      }
      const args: (string | number)[] = []
      for (const row of page) {
        args.push(row.value, row.contactId)
      }
      await client.zadd(keys.rebuild, ...args)
      total += page.length
    }
    await client
      .multi()
      .rename(keys.rebuild, keys.rank)
      .expire(keys.rank, KEY_TTL_SECONDS)
      .del(keys.stats)
      .hset(keys.stats, {
        participants: input.stats.participants,
        totalPoints: input.stats.totalPoints,
        [newTodayField(input.dayKey)]: input.stats.newToday,
      })
      .expire(keys.stats, KEY_TTL_SECONDS)
      .del(keys.top)
      .exec()
    return total
  },

  async readTopCache(leaderboardId: string): Promise<string | null> {
    const client = await getRedisClient()
    return await client.get(leaderboardKeys(leaderboardId).top)
  },

  async writeTopCache(
    leaderboardId: string,
    payload: string,
    ttlSeconds: number,
  ): Promise<void> {
    const client = await getRedisClient()
    await client.set(
      leaderboardKeys(leaderboardId).top,
      payload,
      "EX",
      ttlSeconds,
    )
  },

  /** Removes every key of a leaderboard (finished, deleted, or before a rebuild). */
  async drop(leaderboardId: string): Promise<void> {
    const client = await getRedisClient()
    const keys = leaderboardKeys(leaderboardId)
    await client.del(keys.rank, keys.stats, keys.top, keys.rebuild)
  },

  /** Bytes used by the ranking (null when not built) — for the memory monitor. */
  async memoryUsage(leaderboardId: string): Promise<number | null> {
    const client = await getRedisClient()
    const bytes = (await client.call(
      "MEMORY",
      "USAGE",
      leaderboardKeys(leaderboardId).rank,
    )) as number | null
    return bytes === null ? null : Number(bytes)
  },

  /** Redis-wide `used_memory` in bytes. */
  async usedMemory(): Promise<number | null> {
    const client = await getRedisClient()
    const info = await client.info("memory")
    const match = USED_MEMORY_PATTERN.exec(info)
    return match ? Number(match[1]) : null
  },
})

export type LeaderboardStore = ReturnType<typeof leaderboardStoreFactory>
