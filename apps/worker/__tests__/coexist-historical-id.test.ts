// biome-ignore-all lint/suspicious/noBitwiseOperators: bit-packing assertions
// biome-ignore-all lint/performance/useTopLevelRegex: scoped error-message matchers
import { createId, resolveId } from "@chatbotx.io/utils"
import { describe, expect, it } from "vitest"
import {
  createHistoricalIdFactory,
  decodeHistoricalId,
} from "../src/integration/handlers/coexist/bulk-historical-import"

// Must match COEXIST_EPOCH_MS in bulk-historical-import.ts (the uuniq epoch,
// so historical IDs decode back to real wall-clock createdAt).
const EPOCH_MS = new Date("2004-02-01").getTime()
// 14-bit disambiguator space.
const DISAMBIG_SPACE = 1 << 14
// Fixed ContactInbox for tests that isolate other dimensions.
const CI = "ci-1"

describe("createHistoricalIdFactory", () => {
  it("produces strictly increasing IDs for monotonically increasing dates", () => {
    const make = createHistoricalIdFactory()
    // Same sourceId isolates timestamp ordering in the high bits.
    const ids = [0, 1, 2, 100, 1000].map((delta) =>
      make(new Date(EPOCH_MS + delta), "src-same", CI),
    )
    for (let i = 1; i < ids.length; i++) {
      expect(BigInt(ids[i - 1] as string) < BigInt(ids[i] as string)).toBe(true)
    }
  })

  it("returns distinct IDs for two different messages at the same date", () => {
    const make = createHistoricalIdFactory()
    const date = new Date(EPOCH_MS + 5000)
    const a = make(date, "src-a", CI)
    const b = make(date, "src-b", CI)
    expect(a).not.toBe(b)
  })

  it("is idempotent: same (date, sourceId, contactInboxId) yields the same ID across separate factory instances (runs)", () => {
    const date = new Date(EPOCH_MS + 7777)
    const run1 = createHistoricalIdFactory()(date, "m_abc", CI)
    const run2 = createHistoricalIdFactory()(date, "m_abc", CI)
    // Run-independent: re-importing the same message never re-mints the id, so a
    // second run is deduped by the arbiter instead of colliding on the PK.
    expect(run1).toBe(run2)
  })

  it("mints a DIFFERENT ID for the same (date, sourceId) in a different ContactInbox", () => {
    // Regression: a disconnect/reconnect mints a new ContactInbox for the same
    // contact. The id must key on contactInboxId too — otherwise re-importing
    // the same message re-mints the OLD id and collides with the existing row on
    // the (id, createdAt) PK, which the (contactInboxId, sourceId, createdAt)
    // arbiter can't catch (different contactInboxId).
    const date = new Date(EPOCH_MS + 8888)
    const inInboxA = createHistoricalIdFactory()(date, "m_x", "ci-A")
    const inInboxB = createHistoricalIdFactory()(date, "m_x", "ci-B")
    expect(inInboxA).not.toBe(inInboxB)
    // Both still decode to the same createdAt (only the disambiguator differs).
    expect(decodeHistoricalId(inInboxA).timestampMs).toBe(
      decodeHistoricalId(inInboxB).timestampMs,
    )
  })

  it("advances to a free slot when the same message is requested twice in one import (retry path)", () => {
    const make = createHistoricalIdFactory()
    const date = new Date(EPOCH_MS + 4242)
    const first = make(date, "m_retry", CI)
    const second = make(date, "m_retry", CI)
    // Within one factory the used-set probes forward, so a retry gets a fresh id.
    expect(first).not.toBe(second)
  })

  it("round-trips date through decodeHistoricalId", () => {
    const make = createHistoricalIdFactory()
    const date = new Date(EPOCH_MS + 1_234_567)
    const decoded = decodeHistoricalId(make(date, "src-1", CI))
    expect(decoded.timestampMs).toBe(date.getTime())
    expect(decoded.disambiguator).toBeGreaterThanOrEqual(0)
    expect(decoded.disambiguator).toBeLessThan(DISAMBIG_SPACE)
  })

  it("throws when date is before the epoch", () => {
    const make = createHistoricalIdFactory()
    expect(() => make(new Date(EPOCH_MS - 1), "src-1", CI)).toThrow(
      /out of range/,
    )
  })

  it("keeps IDs unique for many distinct messages at the same millisecond (probe)", () => {
    const make = createHistoricalIdFactory()
    const date = new Date(EPOCH_MS + 999)
    const ids = new Set<string>()
    for (let i = 0; i < 5000; i++) {
      ids.add(make(date, `m_${i}`, CI))
    }
    expect(ids.size).toBe(5000)
    // All still fit within the same millisecond (5000 < 16384 slots).
    for (const id of ids) {
      expect(decodeHistoricalId(id).timestampMs).toBe(date.getTime())
    }
  })

  it("bumps the millisecond forward when the 14-bit disambiguator space is exhausted", () => {
    const make = createHistoricalIdFactory()
    const date = new Date(EPOCH_MS + 42)
    const ids: string[] = []
    for (let i = 0; i < DISAMBIG_SPACE + 1; i++) {
      ids.push(make(date, `m_${i}`, CI))
    }
    // First 16384 fill ms=42; the next one wraps to ms=43.
    const onNextMs = ids.filter(
      (id) => decodeHistoricalId(id).timestampMs === date.getTime() + 1,
    )
    expect(onNextMs.length).toBe(1)
    expect(new Set(ids).size).toBe(DISAMBIG_SPACE + 1)
  })

  it("id order matches createdAt order regardless of call order", () => {
    // Graph streams newest-first; factory must still produce IDs whose numeric
    // order matches `createdAt` order so `ORDER BY id` reflects chronology.
    const make = createHistoricalIdFactory()
    const later = make(new Date(EPOCH_MS + 1000), "src-late", CI)
    const earlier = make(new Date(EPOCH_MS + 500), "src-early", CI)
    expect(BigInt(earlier) < BigInt(later)).toBe(true)
  })

  it("preserves chronological id order across many out-of-order inserts", () => {
    const make = createHistoricalIdFactory()
    const deltas = [5000, 100, 3000, 50, 4000, 200, 10, 4500, 1500]
    const pairs = deltas.map((d) => ({
      delta: d,
      id: make(new Date(EPOCH_MS + d), `m_${d}`, CI),
    }))
    const sortedByTs = [...pairs].sort((a, b) => a.delta - b.delta)
    const sortedById = [...pairs].sort((a, b) =>
      BigInt(a.id) < BigInt(b.id) ? -1 : 1,
    )
    expect(sortedById.map((p) => p.delta)).toEqual(
      sortedByTs.map((p) => p.delta),
    )
  })
})

describe("ID validity via uuniq Snowflake.resolve()", () => {
  it("createId() output resolves to a valid snowflake", () => {
    const id = createId()
    expect(id).toMatch(/^\d+$/)
    const resolved = resolveId(id)
    expect(typeof resolved.created_at).toBe("string")
    expect(Number.isNaN(Date.parse(resolved.created_at))).toBe(false)
    expect(typeof resolved.place_id).toBe("number")
    expect(typeof resolved.sequence).toBe("number")
  })

  it("makeMessageId output resolves under the same Snowflake decoder as createId()", () => {
    // Shared ts_shift=14 means coexist factory IDs are well-formed snowflakes
    // under the same uuniq layout `createId()` uses.
    const id = createHistoricalIdFactory()(
      new Date(EPOCH_MS + 1_234_567),
      "src-1",
      CI,
    )
    expect(id).toMatch(/^\d+$/)
    const resolved = resolveId(id)
    const decodedMs = Date.parse(resolved.created_at)
    expect(Number.isNaN(decodedMs)).toBe(false)
    expect(Math.abs(decodedMs - (EPOCH_MS + 1_234_567))).toBeLessThanOrEqual(1)
  })

  it("createId() and makeMessageId() share id length / magnitude", () => {
    // Both use ts_shift=14 against the same epoch, so a coexist id minted for
    // "now" and a live createId() called now must have the same digit count.
    const liveId = createId()
    const coexistId = createHistoricalIdFactory()(new Date(), "src-now", CI)
    expect(coexistId.length).toBe(liveId.length)
  })
})
