import type Redis from "ioredis"
import { afterEach, describe, expect, test, vi } from "vitest"
import { presenceStoreFactory } from "../src/presence-store"

const NOW = 1_000_000

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * `defineCommand` registers a Lua script and ioredis exposes it as a
 * method on the client — vitest can't run real Lua, so this fake
 * reproduces `PRESENCE_HEARTBEAT_MANY_LUA`'s exact semantics in JS against
 * an in-memory map, to verify the store wires the Lua call's arguments and
 * branching correctly (mirrors `cas-store.test.ts`'s
 * `makeFakeRedisWithLuaCas`).
 */
function makeFakeRedisWithPresenceLua() {
  const scores = new Map<string, Map<string, number>>()

  const zsetFor = (key: string) => {
    let zset = scores.get(key)
    if (!zset) {
      zset = new Map()
      scores.set(key, zset)
    }
    return zset
  }

  const client = {
    defineCommand: vi.fn(),
    presenceHeartbeatMany: vi.fn(
      (
        presenceKey: string,
        ttlMs: string,
        now: string,
        ...members: string[]
      ) => {
        const zset = zsetFor(presenceKey)
        const expiresAt = Number(now) + Number(ttlMs)

        for (const [m, score] of zset) {
          if (score <= Number(now)) {
            zset.delete(m)
          }
        }

        const newlyLive: string[] = []
        for (const member of members) {
          if (!zset.has(member)) {
            newlyLive.push(member)
          }
          zset.set(member, expiresAt)
        }

        return Promise.resolve(newlyLive)
      },
    ),
  } as unknown as Redis

  return { client, scores }
}

describe("presenceStoreFactory.heartbeatMany", () => {
  test("marks every member live via ONE presenceHeartbeatMany Lua call", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
    const { client, scores } = makeFakeRedisWithPresenceLua()
    const store = presenceStoreFactory(async () => client)

    const result = await store.heartbeatMany(
      "workspace:presence:w1",
      ["user-1", "user-2"],
      20_000,
    )

    expect(client.presenceHeartbeatMany).toHaveBeenCalledTimes(1)
    expect(client.presenceHeartbeatMany).toHaveBeenCalledWith(
      "workspace:presence:w1",
      "20000",
      String(NOW),
      "user-1",
      "user-2",
    )
    expect(scores.get("workspace:presence:w1")?.get("user-1")).toBe(
      NOW + 20_000,
    )
    expect(scores.get("workspace:presence:w1")?.get("user-2")).toBe(
      NOW + 20_000,
    )
    expect(result).toEqual({ newlyLiveMembers: ["user-1", "user-2"] })
  })

  test("returns only the members that were NOT already live (renewals excluded)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
    const { client } = makeFakeRedisWithPresenceLua()
    const store = presenceStoreFactory(async () => client)

    await store.heartbeatMany("workspace:presence:w1", ["user-1"], 20_000)
    const result = await store.heartbeatMany(
      "workspace:presence:w1",
      ["user-1", "user-2"],
      20_000,
    )

    expect(result).toEqual({ newlyLiveMembers: ["user-2"] })
  })

  test("a member whose previous lease expired counts as newly live again", async () => {
    const { client } = makeFakeRedisWithPresenceLua()
    const store = presenceStoreFactory(async () => client)

    vi.spyOn(Date, "now").mockReturnValue(NOW)
    await store.heartbeatMany("workspace:presence:w1", ["user-1"], 20_000)

    vi.spyOn(Date, "now").mockReturnValue(NOW + 20_001)
    const result = await store.heartbeatMany(
      "workspace:presence:w1",
      ["user-1"],
      20_000,
    )

    expect(result).toEqual({ newlyLiveMembers: ["user-1"] })
  })

  test("is a no-op (no Redis call) for an empty member list", async () => {
    const { client } = makeFakeRedisWithPresenceLua()
    const store = presenceStoreFactory(async () => client)

    const result = await store.heartbeatMany(
      "workspace:presence:w1",
      [],
      20_000,
    )

    expect(client.presenceHeartbeatMany).not.toHaveBeenCalled()
    expect(result).toEqual({ newlyLiveMembers: [] })
  })
})

describe("presenceStoreFactory.liveMembers", () => {
  test("prunes expired members first, then returns the live set (recent first, capped)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
    const zremrangebyscore = vi.fn(async () => 2)
    const zrevrangebyscore = vi.fn(async () => ["agent-2", "agent-1"])
    const store = presenceStoreFactory(
      async () => ({ zremrangebyscore, zrevrangebyscore }) as unknown as Redis,
    )

    await expect(
      store.liveMembers("workspace:presence:w1", 10),
    ).resolves.toEqual(["agent-2", "agent-1"])

    expect(zremrangebyscore).toHaveBeenCalledWith(
      "workspace:presence:w1",
      0,
      NOW,
    )
    expect(zrevrangebyscore).toHaveBeenCalledWith(
      "workspace:presence:w1",
      "+inf",
      NOW,
      "LIMIT",
      0,
      10,
    )
  })
})
