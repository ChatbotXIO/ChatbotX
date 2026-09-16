import type Redis from "ioredis"
import { describe, expect, test, vi } from "vitest"
import { casStoreFactory } from "../src/cas-store"

describe("casStoreFactory.setIfAbsent", () => {
  test("issues SET key value PX ttlMs NX and reports success", async () => {
    const set = vi.fn(async () => "OK")
    const store = casStoreFactory(async () => ({ set }) as unknown as Redis)

    await expect(
      store.setIfAbsent("voip:offer:w1", { sdp: "v=0..." }, 30_000),
    ).resolves.toBe(true)

    expect(set).toHaveBeenCalledWith(
      "voip:offer:w1",
      JSON.stringify({ sdp: "v=0..." }),
      "PX",
      30_000,
      "NX",
    )
  })

  test("returns false when the key already exists (redelivery cannot overwrite/extend)", async () => {
    const set = vi.fn(async () => null)
    const store = casStoreFactory(async () => ({ set }) as unknown as Redis)

    await expect(
      store.setIfAbsent("voip:offer:w1", { sdp: "v=0..." }, 30_000),
    ).resolves.toBe(false)
  })
})

describe("casStoreFactory.get / getJson / del", () => {
  test("get returns the raw string, null when absent", async () => {
    const get = vi.fn(async (key: string) =>
      key === "present" ? "raw-value" : null,
    )
    const store = casStoreFactory(async () => ({ get }) as unknown as Redis)

    await expect(store.get("present")).resolves.toBe("raw-value")
    await expect(store.get("missing")).resolves.toBeNull()
  })

  test("getJson parses valid JSON and returns null for absent or malformed values", async () => {
    const values: Record<string, string | null> = {
      valid: JSON.stringify({ phase: "reserved" }),
      malformed: "{not-json",
      missing: null,
    }
    const get = vi.fn(async (key: string) => values[key] ?? null)
    const store = casStoreFactory(async () => ({ get }) as unknown as Redis)

    await expect(store.getJson("valid")).resolves.toEqual({
      phase: "reserved",
    })
    await expect(store.getJson("malformed")).resolves.toBeNull()
    await expect(store.getJson("missing")).resolves.toBeNull()
  })

  test("del removes the key", async () => {
    const del = vi.fn(async () => 1)
    const store = casStoreFactory(async () => ({ del }) as unknown as Redis)

    await store.del("voip:ctrl:w1")

    expect(del).toHaveBeenCalledWith("voip:ctrl:w1")
  })
})

describe("casStoreFactory.compareAndSwap", () => {
  /**
   * `defineCommand` registers a Lua script and ioredis exposes it as a
   * method on the client — vitest can't run real Lua, so this fake
   * reproduces `COMPARE_AND_SWAP_JSON_LUA`'s exact semantics in JS against
   * an in-memory map, to verify the store wires the Lua call's arguments
   * and return-value decision correctly.
   */
  function makeFakeRedisWithLuaCas() {
    const values = new Map<string, string>()

    const client = {
      defineCommand: vi.fn(),
      compareAndSwapJson: vi.fn(
        (key: string, expectedJson: string, nextJson: string) => {
          const current = values.get(key)
          if (expectedJson === "") {
            if (current !== undefined) {
              return Promise.resolve(0)
            }
          } else {
            if (current === undefined) {
              return Promise.resolve(0)
            }
            const decodedCurrent = JSON.parse(current) as Record<
              string,
              unknown
            >
            const expected = JSON.parse(expectedJson) as Record<string, unknown>
            const allMatch = Object.entries(expected).every(
              ([field, value]) => decodedCurrent[field] === value,
            )
            if (!allMatch) {
              return Promise.resolve(0)
            }
          }
          values.set(key, nextJson)
          return Promise.resolve(1)
        },
      ),
    } as unknown as Redis

    return { client, values }
  }

  test("applies the swap when every expected field matches the current record", async () => {
    const { client, values } = makeFakeRedisWithLuaCas()
    values.set(
      "voip:ctrl:w1",
      JSON.stringify({ phase: "reserved", fenceToken: "f1" }),
    )
    const store = casStoreFactory(async () => client)

    const applied = await store.compareAndSwap(
      "voip:ctrl:w1",
      { phase: "reserved", fenceToken: "f1" },
      { phase: "answering", fenceToken: "f1" },
      30_000,
    )

    expect(applied).toBe(true)
    expect(JSON.parse(values.get("voip:ctrl:w1") ?? "{}")).toEqual({
      phase: "answering",
      fenceToken: "f1",
    })
  })

  test("rejects the swap when any expected field is stale (lost race)", async () => {
    const { client } = makeFakeRedisWithLuaCas()
    const store = casStoreFactory(async () => client)
    // A concurrent terminate already moved the phase away from "answering".
    await store.compareAndSwap(
      "voip:ctrl:w1",
      null,
      { phase: "terminated", fenceToken: "f1" },
      30_000,
    )

    const applied = await store.compareAndSwap(
      "voip:ctrl:w1",
      { phase: "answering", fenceToken: "f1" },
      { phase: "accepted", fenceToken: "f1" },
      30_000,
    )

    expect(applied).toBe(false)
  })

  test("expected: null requires the key to be absent (create-only swap)", async () => {
    const { client } = makeFakeRedisWithLuaCas()
    const store = casStoreFactory(async () => client)

    await expect(
      store.compareAndSwap("voip:ctrl:w1", null, { phase: "reserved" }, 1000),
    ).resolves.toBe(true)
    await expect(
      store.compareAndSwap("voip:ctrl:w1", null, { phase: "reserved" }, 1000),
    ).resolves.toBe(false)
  })

  test("registers the Lua command only once per client (defineCommand called once)", async () => {
    const { client } = makeFakeRedisWithLuaCas()
    const store = casStoreFactory(async () => client)

    await store.compareAndSwap("k1", null, { a: 1 }, 1000)
    await store.compareAndSwap("k2", null, { a: 1 }, 1000)

    expect(client.defineCommand).toHaveBeenCalledTimes(1)
    expect(client.defineCommand).toHaveBeenCalledWith(
      "compareAndSwapJson",
      expect.objectContaining({ numberOfKeys: 1 }),
    )
  })
})
