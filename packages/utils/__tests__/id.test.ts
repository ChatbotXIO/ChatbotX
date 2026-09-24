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

  test("stays unique across a burst larger than the per-millisecond sequence space", () => {
    const ids = new Set<string>()
    for (let i = 0; i < 3000; i++) {
      ids.add(createId())
    }
    expect(ids.size).toBe(3000)
  })
})

describe("createSnowflakeGenerator", () => {
  test("two processes with different place ids never collide in the same millisecond", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-24T02:25:38.515Z"))
    const workerA = createSnowflakeGenerator({ placeId: 3 })
    const workerB = createSnowflakeGenerator({ placeId: 7 })

    const idsA = new Set(Array.from({ length: 200 }, () => workerA.generate()))
    const idsB = new Set(Array.from({ length: 200 }, () => workerB.generate()))

    const overlap = [...idsA].filter((id) => idsB.has(id))
    expect(overlap).toEqual([])
    for (const id of idsA) {
      expect(resolveId(id).place_id).toBe(3)
    }
  })

  test("starts each millisecond at a random sequence offset instead of 0", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-24T02:25:38.515Z"))
    const generator = createSnowflakeGenerator({ placeId: 1 })

    const firstSequences = new Set<number>()
    for (let i = 0; i < 32; i++) {
      firstSequences.add(resolveId(generator.generate()).sequence)
      vi.advanceTimersByTime(1)
    }

    // 32 independent draws from 1024 values: all-equal has probability ~1e-96.
    expect(firstSequences.size).toBeGreaterThan(1)
  })

  test("ids minted within one millisecond by one generator are unique", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-24T02:25:38.515Z"))
    const generator = createSnowflakeGenerator({ placeId: 0 })

    const ids = new Set(
      Array.from({ length: 1024 }, () => generator.generate()),
    )

    expect(ids.size).toBe(1024)
  })

  test("rejects a place id outside the 4-bit field", () => {
    expect(() =>
      createSnowflakeGenerator({ placeId: SNOWFLAKE_PLACE_ID_MAX + 1 }),
    ).toThrow(PLACE_ID_ERROR)
    expect(() => createSnowflakeGenerator({ placeId: -1 })).toThrow(
      PLACE_ID_ERROR,
    )
  })
})

describe("resolveSnowflakePlaceId", () => {
  test("uses SNOWFLAKE_PLACE_ID when it is a valid integer in range", () => {
    expect(resolveSnowflakePlaceId({ SNOWFLAKE_PLACE_ID: "9" })).toBe(9)
    expect(resolveSnowflakePlaceId({ SNOWFLAKE_PLACE_ID: "0" })).toBe(0)
  })

  test("falls back to a random in-range place id when the env value is missing or invalid", () => {
    const seen = new Set<number>()
    for (const env of [
      {},
      { SNOWFLAKE_PLACE_ID: "" },
      { SNOWFLAKE_PLACE_ID: "abc" },
      { SNOWFLAKE_PLACE_ID: "16" },
      { SNOWFLAKE_PLACE_ID: "-1" },
      { SNOWFLAKE_PLACE_ID: "1.5" },
    ]) {
      const placeId = resolveSnowflakePlaceId(env)
      expect(Number.isInteger(placeId)).toBe(true)
      expect(placeId).toBeGreaterThanOrEqual(0)
      expect(placeId).toBeLessThanOrEqual(SNOWFLAKE_PLACE_ID_MAX)
      seen.add(placeId)
    }
    // Sanity: fallback is not a fixed constant (6 draws from 16 values).
    for (let i = 0; i < 64; i++) {
      seen.add(resolveSnowflakePlaceId({}))
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})
