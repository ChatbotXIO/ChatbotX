import { describe, expect, test } from "vitest"
import {
  computeSendDelayMs,
  isConversionExpired,
  nextProcessingBackoffMs,
} from "../src/google-ads/timing"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = new Date("2026-10-05T12:00:00Z")

describe("computeSendDelayMs", () => {
  test("waits the remainder of the 6h minimum click age", () => {
    const receivedAt = new Date(NOW.getTime() - 2 * HOUR)
    expect(computeSendDelayMs(receivedAt, NOW)).toBe(4 * HOUR)
  })

  test("is the full 6h for a click received just now", () => {
    expect(computeSendDelayMs(NOW, NOW)).toBe(6 * HOUR)
  })

  test("is 0 exactly at 6h", () => {
    expect(computeSendDelayMs(new Date(NOW.getTime() - 6 * HOUR), NOW)).toBe(0)
  })

  test("clamps to 0 once the click is older than 6h", () => {
    expect(computeSendDelayMs(new Date(NOW.getTime() - 30 * HOUR), NOW)).toBe(0)
  })
})

describe("nextProcessingBackoffMs", () => {
  test("steps 3h, 6h, 12h, 24h", () => {
    expect([0, 1, 2, 3].map(nextProcessingBackoffMs)).toEqual([
      3 * HOUR,
      6 * HOUR,
      12 * HOUR,
      24 * HOUR,
    ])
  })

  test("caps at 24h for later polls", () => {
    expect(nextProcessingBackoffMs(4)).toBe(24 * HOUR)
    expect(nextProcessingBackoffMs(100)).toBe(24 * HOUR)
  })

  test("treats negative attempts as the first poll", () => {
    expect(nextProcessingBackoffMs(-5)).toBe(3 * HOUR)
  })
})

describe("isConversionExpired", () => {
  // Plan §6: A = click age at delivery (now - receipt > 90 d); B = click ->
  // conversion (occurredAt - receipt > lookback, null = 90 d). No other rule.
  const R = new Date("2026-07-01T00:00:00Z")
  const atOffset = (ms: number) => new Date(R.getTime() + ms)
  const expired = (input: {
    occurredAt: Date
    now: Date
    lookbackWindowDays: number | null
  }) => isConversionExpired({ ...input, googleClickReceivedAt: R })

  test("is not expired when fresh and inside the lookback", () => {
    for (const nowOffset of [DAY, 2 * DAY]) {
      expect(
        expired({
          occurredAt: atOffset(DAY),
          now: atOffset(nowOffset),
          lookbackWindowDays: 30,
        }),
      ).toBe(false)
    }
  })

  test("B: not expired exactly on the lookback boundary, expired one second past it", () => {
    expect(
      expired({
        occurredAt: atOffset(30 * DAY),
        now: atOffset(31 * DAY),
        lookbackWindowDays: 30,
      }),
    ).toBe(false)
    expect(
      expired({
        occurredAt: atOffset(30 * DAY + 1000),
        now: atOffset(31 * DAY),
        lookbackWindowDays: 30,
      }),
    ).toBe(true)
  })

  test("a conversion inside the lookback delivered after it is not expired (delivery - receipt is bounded by 90 d alone)", () => {
    expect(
      expired({
        occurredAt: atOffset(10 * DAY),
        now: atOffset(40 * DAY),
        lookbackWindowDays: 30,
      }),
    ).toBe(false)
  })

  test("A: not expired exactly 90 d after receipt, expired one second past it", () => {
    expect(
      expired({
        occurredAt: atOffset(DAY),
        now: atOffset(90 * DAY),
        lookbackWindowDays: 90,
      }),
    ).toBe(false)
    expect(
      expired({
        occurredAt: atOffset(DAY),
        now: atOffset(90 * DAY + 1000),
        lookbackWindowDays: 90,
      }),
    ).toBe(true)
  })

  test("a null lookback behaves as 90 days", () => {
    expect(
      expired({
        occurredAt: atOffset(89 * DAY),
        now: atOffset(89 * DAY),
        lookbackWindowDays: null,
      }),
    ).toBe(false)
    expect(
      expired({
        // `now` stays inside rule A, so only rule B (null -> 90 d) can fire.
        occurredAt: atOffset(91 * DAY),
        now: atOffset(90 * DAY),
        lookbackWindowDays: null,
      }),
    ).toBe(true)
  })

  test("a lookback above 90 d does not extend rule A", () => {
    // B allows 100 d of a 120 d lookback; A (100 d > 90 d) still expires it.
    expect(
      expired({
        occurredAt: atOffset(100 * DAY),
        now: atOffset(100 * DAY),
        lookbackWindowDays: 120,
      }),
    ).toBe(true)
  })

  test("a conversion before the click receipt is not expired locally, however early", () => {
    expect(
      expired({
        occurredAt: atOffset(-1 * HOUR),
        now: atOffset(HOUR),
        lookbackWindowDays: 30,
      }),
    ).toBe(false)
    expect(
      expired({
        occurredAt: atOffset(-100 * DAY),
        now: atOffset(HOUR),
        lookbackWindowDays: 30,
      }),
    ).toBe(false)
  })
})

describe("redrive delays", () => {
  test("a transient processing failure waits 6h (plan §8); reauth deferral stays 1h", async () => {
    const { PROCESSING_REDRIVE_DELAY_MS, REDRIVE_DELAY_MS } = await import(
      "../src/google-ads/timing"
    )
    expect(PROCESSING_REDRIVE_DELAY_MS).toBe(6 * 60 * 60 * 1000)
    expect(REDRIVE_DELAY_MS).toBe(60 * 60 * 1000)
  })
})
