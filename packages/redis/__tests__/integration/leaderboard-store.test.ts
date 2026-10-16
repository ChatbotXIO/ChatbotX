// @vitest-environment node

import { randomUUID as createId } from "node:crypto"
import Redis from "ioredis"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import {
  encodeRankValue,
  leaderboardKeys,
  leaderboardStoreFactory,
} from "../../src/leaderboard-store"
import { realRedisUrl } from "./redis-url"

const redisUrl = realRedisUrl()
const MAX_SCORE = 89_999_999
const DAY = "2026-10-12"

describe.skipIf(!redisUrl)("leaderboard store against Redis", () => {
  let client: Redis
  let store: ReturnType<typeof leaderboardStoreFactory>
  const leaderboardIds = new Set<string>()

  beforeAll(() => {
    if (!redisUrl) {
      throw new Error("REDIS_URL is required for Redis integration tests")
    }
    client = new Redis(redisUrl)
    store = leaderboardStoreFactory(async () => client)
  })

  afterEach(async () => {
    for (const id of leaderboardIds) {
      await store.drop(id)
    }
    leaderboardIds.clear()
  })

  afterAll(async () => {
    await client.quit()
  })

  const newLeaderboard = async (
    rows: { contactId: string; score: number; tie: number }[] = [],
  ): Promise<string> => {
    const id = `test-${createId()}`
    leaderboardIds.add(id)
    function* pages() {
      yield rows.map((row) => ({
        contactId: row.contactId,
        value: encodeRankValue(row.score, row.tie),
      }))
    }
    await store.replaceRanking({
      leaderboardId: id,
      pages: pages(),
      stats: {
        participants: rows.length,
        totalPoints: rows.reduce((sum, row) => sum + row.score, 0),
        newToday: 0,
      },
      dayKey: DAY,
    })
    return id
  }

  const set = (
    leaderboardId: string,
    contactId: string,
    score: number,
    tieSeconds: number,
    isNew = false,
  ) =>
    store.setScore({
      leaderboardId,
      contactId,
      score,
      tieSeconds,
      isNew,
      dayKey: DAY,
    })

  test("setScore is a no-op when the ranking is not built", async () => {
    const id = `test-${createId()}`
    leaderboardIds.add(id)
    await expect(set(id, "1", 10, 5, true)).resolves.toBe(false)
    await expect(client.exists(leaderboardKeys(id).rank)).resolves.toBe(0)
    await expect(store.top(id, 10)).resolves.toBeNull()
  })

  test("an empty but built ranking is distinguishable from a missing one", async () => {
    const id = await newLeaderboard()
    await expect(store.top(id, 10)).resolves.toEqual([])
  })

  test("setScore writes the exact value, the last write wins", async () => {
    const id = await newLeaderboard()
    await set(id, "42", 100, 50)
    await set(id, "42", 60, 80)
    const raw = Number(await client.zscore(leaderboardKeys(id).rank, "42"))
    expect(raw).toBe(encodeRankValue(60, 80))
  })

  test("ranks by score, then by who reached the score first", async () => {
    const id = await newLeaderboard()
    await set(id, "late", 620, 500, true)
    await set(id, "early", 620, 100, true)
    await set(id, "top", 900, 900, true)

    await expect(store.top(id, 10)).resolves.toEqual([
      { contactId: "top", score: 900 },
      { contactId: "early", score: 620 },
      { contactId: "late", score: 620 },
    ])
    const { built, ranks } = await store.ranksOf(id, ["late", "missing"])
    expect(built).toBe(true)
    expect(ranks.get("late")).toEqual({ rank: 3, score: 620 })
    expect(ranks.get("missing")).toBeNull()
  })

  test("the max score stays an exact integer in the rank value", async () => {
    const id = await newLeaderboard()
    await set(id, "b", MAX_SCORE, 3)
    const raw = Number(await client.zscore(leaderboardKeys(id).rank, "b"))
    expect(Number.isSafeInteger(raw)).toBe(true)
  })

  test("stats track points and new participants", async () => {
    const id = await newLeaderboard([{ contactId: "x", score: 5, tie: 0 }])
    await set(id, "y", 7, 1, true)
    await set(id, "x", 8, 2)
    const stats = await store.statsMany([id, "never-built"], DAY)
    expect(stats.get(id)).toEqual({
      participants: 2,
      totalPoints: 15,
      newToday: 1,
    })
    expect(stats.get("never-built")).toBeNull()
  })

  test("a write during a rebuild also lands in the rebuild key", async () => {
    const id = await newLeaderboard()
    const keys = leaderboardKeys(id)
    await client.zadd(keys.rebuild, "-inf", "_")
    await set(id, "new", 40, 10, true)
    const raw = Number(await client.zscore(keys.rebuild, "new"))
    expect(raw).toBe(encodeRankValue(40, 10))
  })

  test("setMembers overwrites and removes members, only when built", async () => {
    const id = await newLeaderboard([
      { contactId: "1", score: 30, tie: 0 },
      { contactId: "2", score: 20, tie: 0 },
    ])
    await store.setMembers(id, [
      { contactId: "1", value: encodeRankValue(55, 4) },
      { contactId: "2", value: null },
    ])
    await expect(store.top(id, 5)).resolves.toEqual([
      { contactId: "1", score: 55 },
    ])

    const missing = `test-${createId()}`
    leaderboardIds.add(missing)
    await store.setMembers(missing, [{ contactId: "1", value: 1 }])
    await expect(client.exists(leaderboardKeys(missing).rank)).resolves.toBe(0)
  })

  test("replaceRanking swaps in the rebuilt set and pagination skips the sentinel", async () => {
    const id = await newLeaderboard([
      { contactId: "1", score: 30, tie: 0 },
      { contactId: "2", score: 20, tie: 0 },
      { contactId: "3", score: 10, tie: 0 },
    ])
    await expect(store.top(id, 2)).resolves.toEqual([
      { contactId: "1", score: 30 },
      { contactId: "2", score: 20 },
    ])
    await expect(store.top(id, 5, 2)).resolves.toEqual([
      { contactId: "3", score: 10 },
    ])
    await expect(client.exists(leaderboardKeys(id).rebuild)).resolves.toBe(0)
    expect(await client.ttl(leaderboardKeys(id).rank)).toBeGreaterThan(0)
  })

  test("ban removes a member and unban puts it back", async () => {
    const id = await newLeaderboard([{ contactId: "1", score: 30, tie: 0 }])
    await store.removeMember(id, "1")
    await expect(store.top(id, 5)).resolves.toEqual([])
    await store.setMember({
      leaderboardId: id,
      contactId: "1",
      score: 30,
      tieSeconds: 0,
    })
    await expect(store.top(id, 5)).resolves.toEqual([
      { contactId: "1", score: 30 },
    ])
  })

  test("memory per participant stays small", async () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => ({
      contactId: String(7_300_000_000_000_000_000n + BigInt(index)),
      score: index % 5000,
      tie: index,
    }))
    const id = await newLeaderboard(rows)
    const bytes = await store.memoryUsage(id)
    expect(bytes).not.toBeNull()
    // Skiplist encoding with 19-digit members: ~120-150 bytes each.
    expect((bytes ?? 0) / rows.length).toBeLessThan(200)
  })
})
