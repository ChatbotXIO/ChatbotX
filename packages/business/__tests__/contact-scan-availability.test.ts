import { afterEach, describe, expect, test, vi } from "vitest"
import {
  OPEN_CONTACT_SCAN_AVAILABILITY,
  resolveContactScanAvailability,
} from "../src/contact-scan/availability"
import { CONTACT_SCAN_COOLDOWN_MS } from "../src/contact-scan/constants"

const NOW = new Date("2026-09-09T12:00:00.000Z")

describe("resolveContactScanAvailability", () => {
  afterEach(() => {
    vi.resetModules()
  })

  test("no history → open (idle)", () => {
    expect(resolveContactScanAvailability({ latest: null, now: NOW })).toEqual(
      OPEN_CONTACT_SCAN_AVAILABILITY,
    )
    expect(
      resolveContactScanAvailability({ latest: null, now: NOW }).canScan,
    ).toBe(true)
  })

  test.each([
    "succeeded",
    "partial",
    "failed",
  ] as const)("settled (%s) + < 24h cooldown → blocked with nextScanAt = createdAt + 24h", (status) => {
    // 1h after creation: inside the 24h cooldown; the cooldown boundary
    // (createdAt + 24h) is later than the ETA (createdAt + 4h), so it wins.
    const createdAt = new Date(NOW.getTime() - 60 * 60 * 1000)

    const result = resolveContactScanAvailability({
      latest: { status, createdAt },
      now: NOW,
    })

    expect(result).toEqual({
      canScan: false,
      blockedReason: "cooldown",
      nextScanAt: new Date(createdAt.getTime() + CONTACT_SCAN_COOLDOWN_MS),
    })
  })

  test.each([
    "succeeded",
    "partial",
    "failed",
  ] as const)("settled (%s) + >= 24h since createdAt → open", (status) => {
    const createdAt = new Date(NOW.getTime() - CONTACT_SCAN_COOLDOWN_MS)

    expect(
      resolveContactScanAvailability({
        latest: { status, createdAt },
        now: NOW,
      }),
    ).toEqual({ canScan: true })
  })

  test.each([
    "init",
    "running",
    "waiting",
  ] as const)("active (%s) → never open, blockedReason = running", (status) => {
    const createdAt = new Date(NOW.getTime() - 60 * 60 * 1000)

    const result = resolveContactScanAvailability({
      latest: { status, createdAt },
      now: NOW,
    })

    expect(result.canScan).toBe(false)
    expect(result).toMatchObject({ blockedReason: "running" })
  })

  test("active run far in the past is still never open (sweeper releases it, not the UI)", () => {
    const createdAt = new Date(NOW.getTime() - 10 * CONTACT_SCAN_COOLDOWN_MS)

    const result = resolveContactScanAvailability({
      latest: { status: "running", createdAt },
      now: NOW,
    })

    expect(result.canScan).toBe(false)
  })

  test("every CoexistRunStatus has a rule (no silent fallthrough)", () => {
    const allStatuses = [
      "init",
      "running",
      "succeeded",
      "failed",
      "partial",
      "waiting",
    ] as const

    for (const status of allStatuses) {
      const result = resolveContactScanAvailability({
        latest: { status, createdAt: NOW },
        now: NOW,
      })
      expect(result).toBeDefined()
      expect(typeof result.canScan).toBe("boolean")
    }
  })

  test("nextScanAt picks the later boundary between the cooldown end and the ETA", async () => {
    // The production constants keep COOLDOWN (24h) strictly above ETA (4h),
    // so `nextScanAt` always resolves to the cooldown boundary in practice.
    // This test swaps that relationship (a smaller cooldown than ETA) to
    // prove `resolveContactScanAvailability` genuinely takes the LATER of
    // the two rather than always trusting the cooldown — a future constant
    // change cannot silently break that invariant without failing here.
    vi.resetModules()
    vi.doMock("../src/contact-scan/constants", () => ({
      CONTACT_SCAN_COOLDOWN_MS: 60 * 60 * 1000, // 1h
      CONTACT_SCAN_ETA_MS: 5 * 60 * 60 * 1000, // 5h — now later than cooldown
      CONTACT_SCAN_MAX_ATTEMPTS: 5,
      CONTACT_SCAN_TRIGGER_SOURCE: "contact-scan-manual",
      CONTACT_SCAN_ERRORS: {},
    }))

    const { resolveContactScanAvailability: resolveWithSwappedConstants } =
      await import("../src/contact-scan/availability")

    const createdAt = new Date(NOW.getTime() - 30 * 60 * 1000) // 30 min ago
    const swappedEtaMs = 5 * 60 * 60 * 1000

    const result = resolveWithSwappedConstants({
      latest: { status: "succeeded", createdAt },
      now: NOW,
    })

    expect(result).toEqual({
      canScan: false,
      blockedReason: "cooldown",
      nextScanAt: new Date(createdAt.getTime() + swappedEtaMs),
    })
  })
})
