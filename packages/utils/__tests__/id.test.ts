import { Snowflake } from "uuniq"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createId,
  parseSnowflakePlaceId,
  resolveId,
  SymbolicSnowflakeIDs,
} from "../src/id"

const EPOCH = new Date("2004-02-01").toISOString()
const SYMBOLIC_ID_REGEX = /^[0-9A-Za-z]+$/

afterEach(() => {
  vi.useRealTimers()
})

describe("parseSnowflakePlaceId", () => {
  test("uses the local place when no production value is configured", () => {
    expect(parseSnowflakePlaceId(undefined, false)).toBe(0)
  })

  test("requires a configured place in production", () => {
    expect(() => parseSnowflakePlaceId(undefined, true)).toThrow(
      "SNOWFLAKE_PLACE_ID must be set in production",
    )
  })

  test("accepts every place supported by the Snowflake layout", () => {
    expect(parseSnowflakePlaceId("0", true)).toBe(0)
    expect(parseSnowflakePlaceId("15", true)).toBe(15)
  })

  test("rejects malformed and out-of-range places", () => {
    expect(() => parseSnowflakePlaceId("1.5", true)).toThrow(
      "SNOWFLAKE_PLACE_ID must be an integer from 0 to 15",
    )
    expect(() => parseSnowflakePlaceId("16", true)).toThrow(
      "SNOWFLAKE_PLACE_ID must be an integer from 0 to 15",
    )
  })

  test("keeps simultaneous first IDs distinct across configured servers", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-24T12:00:00.000Z"))

    const firstServer = new Snowflake({
      epoch: EPOCH,
      place_id: parseSnowflakePlaceId("2", true),
    })
    const secondServer = new Snowflake({
      epoch: EPOCH,
      place_id: parseSnowflakePlaceId("3", true),
    })

    const firstId = firstServer.generate()
    const secondId = secondServer.generate()

    expect(firstId).not.toBe(secondId)
    expect(resolveId(firstId).place_id).toBe(2)
    expect(resolveId(secondId).place_id).toBe(3)
  })
})

describe("SymbolicSnowflakeIDs", () => {
  test("emits distinct base-62 invite codes from the configured ID generator", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-24T12:00:00.000Z"))

    const numericId = createId()
    const firstCode = SymbolicSnowflakeIDs.generate()
    const secondCode = SymbolicSnowflakeIDs.generate()

    expect(firstCode).toMatch(SYMBOLIC_ID_REGEX)
    expect(secondCode).toMatch(SYMBOLIC_ID_REGEX)
    expect(firstCode).not.toBe(secondCode)
    expect(firstCode).not.toBe(numericId)
  })
})
