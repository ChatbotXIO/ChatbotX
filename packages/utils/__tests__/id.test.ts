import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createId,
  createSnowflakeGenerator,
  resolveId,
  resolveSnowflakePlaceId,
  SNOWFLAKE_PLACE_ID_MAX,
} from "../src/id"

// Regression: every process generated snowflakes with place_id 0 and a
// sequence that reset to 0 on each new millisecond, so two workers (or the
// builder and a worker) minting their first id in the same millisecond
// produced the exact same number → "duplicate key value violates unique
// constraint Message_pkey" on production. The generator now carries a
// per-process place id and starts each millisecond at a random sequence
// offset. The uuniq layout (timestamp<<14 | place<<10 | sequence) is kept so
// existing ids and `resolveId` stay valid.

const NUMERIC_ID = /^\d+$/
const PLACE_ID_ERROR = /place id/i
const FROZEN_NOW = new Date("2026-09-24T02:25:38.515Z")
const SEQUENCE_SPACE = 1024

/** Deterministic stand-in for Math.random: returns `value` on every call. */
const constantRandom = (value: number) => () => value

afterEach(() => {
  vi.useRealTimers()
})

describe("createId", () => {
  test("decodes with resolveId to the generation time under the legacy uuniq layout", () => {
    const before = Date.now()
    const id = createId()
    const after = Date.now()

    const resolved = resolveId(id)
    const decodedMs = Date.parse(resolved.created_at)

    expect(id).toMatch(NUMERIC_ID)
    expect(decodedMs).toBeGreaterThanOrEqual(before)
    expect(decodedMs).toBeLessThanOrEqual(after)
    expect(resolved.place_id).toBeGreaterThanOrEqual(0)
    expect(resolved.place_id).toBeLessThanOrEqual(SNOWFLAKE_PLACE_ID_MAX)
  })

  test("stays unique and strictly increasing across a burst larger than the per-millisecond sequence space", () => {
    const ids: string[] = []
    for (let i = 0; i < 3000; i++) {
      ids.push(createId())
    }

    expect(new Set(ids).size).toBe(3000)
    for (let i = 1; i < ids.length; i++) {
      expect(BigInt(ids[i]) > BigInt(ids[i - 1])).toBe(true)
    }
  })
})

describe("createSnowflakeGenerator", () => {
  test("encodes the place id in the 4-bit field the legacy decoder reads", () => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
    const generator = createSnowflakeGenerator({
      placeId: 3,
      random: constantRandom(0),
    })

    const resolved = resolveId(generator.generate())

    expect(resolved.place_id).toBe(3)
    expect(resolved.sequence).toBe(0)
    expect(resolved.created_at).toBe(FROZEN_NOW.toISOString())
  })

  test("two processes with different place ids never collide in the same millisecond", () => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
    // Same random draw on both sides: the place id alone must separate them.
    const workerA = createSnowflakeGenerator({
      placeId: 3,
      random: constantRandom(0),
    })
    const workerB = createSnowflakeGenerator({
      placeId: 7,
      random: constantRandom(0),
    })

    const idsA = new Set(Array.from({ length: 200 }, () => workerA.generate()))
    const idsB = new Set(Array.from({ length: 200 }, () => workerB.generate()))

    expect([...idsA].filter((id) => idsB.has(id))).toEqual([])
  })

  test("two processes sharing a place id are separated by their per-millisecond sequence offset", () => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
    const legacyLike = createSnowflakeGenerator({
      placeId: 0,
      random: constantRandom(0), // offset 0, exactly what the old generator did
    })
    const upgraded = createSnowflakeGenerator({
      placeId: 0,
      random: constantRandom(0.5), // offset 512
    })

    const legacyIds = new Set(
      Array.from({ length: 100 }, () => legacyLike.generate()),
    )
    const upgradedIds = Array.from({ length: 100 }, () => upgraded.generate())

    expect(upgradedIds.filter((id) => legacyIds.has(id))).toEqual([])
    expect(resolveId(upgradedIds[0]).sequence).toBe(512)
  })

  test("starts each new millisecond at the sequence offset drawn from random", () => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
    const draws = [0.25, 0.75]
    const generator = createSnowflakeGenerator({
      placeId: 1,
      random: () => draws.shift() ?? 0,
    })

    const first = resolveId(generator.generate()).sequence
    vi.advanceTimersByTime(1)
    const second = resolveId(generator.generate()).sequence

    expect(first).toBe(256)
    expect(second).toBe(768)
  })

  test("never wraps the sequence inside a millisecond, so ids stay strictly increasing", () => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
    // Offset 1013 leaves room for 11 ids in the first slot.
    const generator = createSnowflakeGenerator({
      placeId: 0,
      random: constantRandom(0.99),
    })

    const ids = Array.from({ length: 30 }, () => generator.generate())

    for (let i = 1; i < ids.length; i++) {
      expect(BigInt(ids[i]) > BigInt(ids[i - 1])).toBe(true)
    }
    expect(resolveId(ids[10]).sequence).toBe(1023)
    expect(resolveId(ids[10]).created_at).toBe(FROZEN_NOW.toISOString())
    expect(resolveId(ids[11]).sequence).toBe(1013)
    expect(Date.parse(resolveId(ids[11]).created_at)).toBe(
      FROZEN_NOW.getTime() + 1,
    )
  })

  test("exhausting the sequence in one millisecond advances a logical clock instead of blocking", () => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
    const generator = createSnowflakeGenerator({
      placeId: 0,
      random: constantRandom(0),
    })

    for (let i = 0; i < SEQUENCE_SPACE; i++) {
      generator.generate()
    }
    // Wall clock is frozen; a busy-wait here would never return.
    const overflow = resolveId(generator.generate())

    expect(Date.parse(overflow.created_at)).toBe(FROZEN_NOW.getTime() + 1)
    expect(overflow.sequence).toBe(0)
  })

  test("keeps ids strictly increasing when the wall clock steps backwards", () => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
    const generator = createSnowflakeGenerator({
      placeId: 0,
      random: constantRandom(0),
    })

    const beforeRollback = generator.generate()
    vi.setSystemTime(new Date(FROZEN_NOW.getTime() - 5000))
    const afterRollback = generator.generate()

    expect(BigInt(afterRollback) > BigInt(beforeRollback)).toBe(true)
    expect(resolveId(afterRollback).created_at).toBe(FROZEN_NOW.toISOString())
  })

  test("rejects a place id outside the 4-bit field", () => {
    expect(() =>
      createSnowflakeGenerator({ placeId: SNOWFLAKE_PLACE_ID_MAX + 1 }),
    ).toThrow(PLACE_ID_ERROR)
    expect(() => createSnowflakeGenerator({ placeId: -1 })).toThrow(
      PLACE_ID_ERROR,
    )
    expect(() => createSnowflakeGenerator({ placeId: 1.5 })).toThrow(
      PLACE_ID_ERROR,
    )
  })
})

describe("resolveSnowflakePlaceId", () => {
  test("uses SNOWFLAKE_PLACE_ID when it is a valid integer in range", () => {
    expect(resolveSnowflakePlaceId({ SNOWFLAKE_PLACE_ID: "9" })).toBe(9)
    expect(resolveSnowflakePlaceId({ SNOWFLAKE_PLACE_ID: "0" })).toBe(0)
    expect(resolveSnowflakePlaceId({ SNOWFLAKE_PLACE_ID: "15" })).toBe(15)
  })

  test("never draws the legacy place id 0 when falling back to random, so a rolling deploy cannot overlap old processes", () => {
    const drawn = new Set<number>()
    for (let step = 0; step < 1; step += 1 / 64) {
      drawn.add(resolveSnowflakePlaceId({}, constantRandom(step)))
    }
    drawn.add(resolveSnowflakePlaceId({}, constantRandom(0.999_999)))

    expect(drawn.has(0)).toBe(false)
    expect(Math.min(...drawn)).toBe(1)
    expect(Math.max(...drawn)).toBe(SNOWFLAKE_PLACE_ID_MAX)
    expect(drawn.size).toBe(SNOWFLAKE_PLACE_ID_MAX)
  })

  test("ignores a missing or invalid env value and falls back to random", () => {
    for (const env of [
      {},
      { SNOWFLAKE_PLACE_ID: "" },
      { SNOWFLAKE_PLACE_ID: "abc" },
      { SNOWFLAKE_PLACE_ID: "16" },
      { SNOWFLAKE_PLACE_ID: "-1" },
      { SNOWFLAKE_PLACE_ID: "1.5" },
    ]) {
      expect(resolveSnowflakePlaceId(env, constantRandom(0.5))).toBe(8)
    }
  })
})
