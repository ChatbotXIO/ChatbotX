import type { IncomingMessage } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  setNumberIfNotExists: vi.fn(),
  setNumber: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    exists: mocks.exists,
    setNumberIfNotExists: mocks.setNumberIfNotExists,
    setNumber: mocks.setNumber,
  },
}))
vi.mock("../src/logger", () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const {
  claimGoogleClickLookup,
  isGoogleClickLookupCandidate,
  markGoogleClickLookupDone,
} = await import("../src/google-ads/click-lookup")

const FIVE_MINUTES_SECONDS = 5 * 60
const TWENTY_FOUR_HOURS_SECONDS = 24 * 60 * 60

const inbound = (overrides: Partial<IncomingMessage> = {}): IncomingMessage =>
  ({
    sourceId: "m-1",
    messageType: "incoming",
    contentType: "text",
    text: "hi",
    ...overrides,
  }) as IncomingMessage

describe("isGoogleClickLookupCandidate", () => {
  test("accepts a real inbound message on a profile-lookup channel", () => {
    expect(
      isGoogleClickLookupCandidate({
        channel: "zalo",
        incomingMessage: inbound(),
      }),
    ).toBe(true)
  })

  test.each([
    "whatsapp",
    "messenger",
    "telegram",
  ])("rejects %s, whose click is not a profile lookup", (channel) => {
    expect(
      isGoogleClickLookupCandidate({ channel, incomingMessage: inbound() }),
    ).toBe(false)
  })

  test.each([
    ["an outgoing echo", { messageType: "outgoing" as const }],
    ["an activity row", { type: "activity" as const }],
  ])("rejects %s", (_name, overrides) => {
    expect(
      isGoogleClickLookupCandidate({
        channel: "zalo",
        incomingMessage: inbound(overrides),
      }),
    ).toBe(false)
  })
})

describe("claimGoogleClickLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exists.mockResolvedValue(false)
    mocks.setNumberIfNotExists.mockResolvedValue(true)
  })

  test("grants the claim and holds the attempt for the backoff window", async () => {
    expect(await claimGoogleClickLookup("ci-1")).toBe(true)
    expect(mocks.exists).toHaveBeenCalledWith("google-click-lookup:done:ci-1")
    expect(mocks.setNumberIfNotExists).toHaveBeenCalledWith(
      "google-click-lookup:attempt:ci-1",
      expect.any(Number),
      FIVE_MINUTES_SECONDS,
    )
  })

  test("denies the claim, without taking an attempt, once the session lookup is done", async () => {
    mocks.exists.mockResolvedValue(true)

    expect(await claimGoogleClickLookup("ci-1")).toBe(false)
    expect(mocks.setNumberIfNotExists).not.toHaveBeenCalled()
  })

  test("denies a concurrent claim while another attempt holds the marker", async () => {
    mocks.setNumberIfNotExists.mockResolvedValue(false)

    expect(await claimGoogleClickLookup("ci-1")).toBe(false)
  })

  test.each([
    ["the done check", () => mocks.exists.mockRejectedValue(new Error("down"))],
    [
      "the attempt write",
      () => mocks.setNumberIfNotExists.mockRejectedValue(new Error("down")),
    ],
  ])("fails closed and logs when Redis fails on %s", async (_name, arrange) => {
    arrange()

    expect(await claimGoogleClickLookup("ci-1")).toBe(false)
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String),
    )
  })
})

describe("markGoogleClickLookupDone", () => {
  beforeEach(() => vi.clearAllMocks())

  test("records the session lookup for 24 hours", async () => {
    await markGoogleClickLookupDone("ci-1")

    expect(mocks.setNumber).toHaveBeenCalledWith(
      "google-click-lookup:done:ci-1",
      expect.any(Number),
      TWENTY_FOUR_HOURS_SECONDS,
    )
  })

  test("swallows a Redis failure (the lookup may simply run again)", async () => {
    mocks.setNumber.mockRejectedValue(new Error("down"))

    await expect(markGoogleClickLookupDone("ci-1")).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })
})
