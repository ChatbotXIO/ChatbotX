import { describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { decodeRef, encodeRef } = await import("../src/referral/utils")

// Telegram's `start` parameter is the tightest constraint any channel puts on
// a ref: 64 characters, `[A-Za-z0-9_-]` only.
const TELEGRAM_START_MAX_LENGTH = 64
const TELEGRAM_START_ALPHABET = /^[A-Za-z0-9_-]+$/

const MINIGAME_ID = "11674826046652416"
const REFERRER_CONTACT_ID = "11597088455065600"

describe("minigame-share ref", () => {
  test("round-trips a minigame share ref", () => {
    const ref = encodeRef({
      type: "minigame-share",
      minigameId: MINIGAME_ID,
      referrerContactId: REFERRER_CONTACT_ID,
    })

    expect(ref.startsWith("mg_")).toBe(true)
    expect(decodeRef(ref)).toEqual({
      type: "minigame-share",
      minigameId: MINIGAME_ID,
      referrerContactId: REFERRER_CONTACT_ID,
    })
  })

  test("fits inside every channel's ref parameter", () => {
    const ref = encodeRef({
      type: "minigame-share",
      minigameId: MINIGAME_ID,
      referrerContactId: REFERRER_CONTACT_ID,
    })

    expect(ref.length).toBeLessThanOrEqual(TELEGRAM_START_MAX_LENGTH)
    expect(ref).toMatch(TELEGRAM_START_ALPHABET)
  })

  test("is not swallowed by the reflink fallthrough", () => {
    const ref = encodeRef({
      type: "minigame-share",
      minigameId: MINIGAME_ID,
      referrerContactId: REFERRER_CONTACT_ID,
    })

    expect(decodeRef(ref)?.type).toBe("minigame-share")
  })

  // `decodeBase62("")` returns "0" WITHOUT throwing, so an empty segment
  // would otherwise resolve to minigame "0" / contact "0" instead of failing.
  test.each([
    "mg_",
    "mg__",
    "mg_x",
    "mg_x_",
    "mg__x",
  ])("rejects the malformed ref %j instead of decoding an empty segment to 0", (ref) => {
    expect(decodeRef(ref)).toBeUndefined()
  })

  test("leaves the other ref families alone", () => {
    expect(decodeRef(encodeRef({ type: "flow", flowId: "123" }))).toEqual({
      type: "flow",
      flowId: "123",
      nodeId: undefined,
    })
    expect(decodeRef(encodeRef({ type: "draft", flowId: "123" }))).toEqual({
      type: "draft",
      flowId: "123",
    })
    expect(decodeRef(encodeRef({ type: "qr-code", name: "promo" }))).toEqual({
      type: "qr-code",
      name: "promo",
    })
    expect(decodeRef("promo")).toEqual({ type: "reflink", name: "promo" })
  })
})
