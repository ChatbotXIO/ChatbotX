import type Redis from "ioredis"
import { afterEach, describe, expect, test, vi } from "vitest"
import { presenceStoreFactory } from "../src/presence-store"

const NOW = 1_000_000

afterEach(() => {
  vi.restoreAllMocks()
})

describe("presenceStoreFactory.heartbeat", () => {
  test("pipelines ZADD (scored by expiry) + PEXPIRE so the member add and key TTL land together", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
    const zadd = vi.fn(() => pipeline)
    const pexpire = vi.fn(() => pipeline)
    const exec = vi.fn(async () => [])
    const pipeline = { zadd, pexpire, exec }
    const multi = vi.fn(() => pipeline)
    const store = presenceStoreFactory(
      async () => ({ multi }) as unknown as Redis,
    )

    await store.heartbeat("voip:presence:w1", "agent-1", 45_000)

    expect(zadd).toHaveBeenCalledWith(
      "voip:presence:w1",
      NOW + 45_000,
      "agent-1",
    )
    expect(pexpire).toHaveBeenCalledWith("voip:presence:w1", 45_000)
    expect(exec).toHaveBeenCalled()
  })
})

describe("presenceStoreFactory.drop", () => {
  test("ZREMs the member", async () => {
    const zrem = vi.fn(async () => 1)
    const store = presenceStoreFactory(
      async () => ({ zrem }) as unknown as Redis,
    )

    await store.drop("voip:presence:w1", "agent-1")

    expect(zrem).toHaveBeenCalledWith("voip:presence:w1", "agent-1")
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

    await expect(store.liveMembers("voip:presence:w1", 10)).resolves.toEqual([
      "agent-2",
      "agent-1",
    ])

    expect(zremrangebyscore).toHaveBeenCalledWith("voip:presence:w1", 0, NOW)
    expect(zrevrangebyscore).toHaveBeenCalledWith(
      "voip:presence:w1",
      "+inf",
      NOW,
      "LIMIT",
      0,
      10,
    )
  })
})
