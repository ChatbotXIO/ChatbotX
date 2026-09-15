import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  sweepStaleRinging: vi.fn(),
  finalizeById: vi.fn(),
  endReservedCall: vi.fn(),
  resolveVoipAuthByInboxId: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    sweepStaleRinging: mocks.sweepStaleRinging,
    finalizeById: mocks.finalizeById,
  },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    info: mocks.logInfo,
    warn: mocks.logWarn,
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock("../src/integration/handlers/whatsapp-voip-signaling", () => ({
  endReservedCall: mocks.endReservedCall,
  resolveVoipAuthByInboxId: mocks.resolveVoipAuthByInboxId,
}))

const { sweepStaleWhatsappCalls } = await import(
  "../src/schedule/handlers/sweep-stale-whatsapp-calls"
)

const staleRow = (overrides: Record<string, unknown> = {}) => ({
  id: "call-1",
  wacid: null as string | null,
  inboxId: "inbox-1",
  status: "ringing" as const,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveVoipAuthByInboxId.mockResolvedValue({ fake: "auth" })
  mocks.finalizeById.mockResolvedValue({ id: "call-1" })
})

describe("sweepStaleWhatsappCalls", () => {
  test("a stale row with no wacid is finalized directly, never touching the call-control path", async () => {
    mocks.sweepStaleRinging.mockResolvedValue([staleRow({ wacid: null })])

    await sweepStaleWhatsappCalls()

    expect(mocks.endReservedCall).not.toHaveBeenCalled()
    expect(mocks.resolveVoipAuthByInboxId).not.toHaveBeenCalled()
    expect(mocks.finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-1",
        status: "failed",
        lastError: "stale-ringing-never-finalized",
      }),
    )
  })

  test("a stale row whose control record is already gone (endReservedCall no-ops) is finalized directly", async () => {
    const row = staleRow({ wacid: "wacid.GONE" })
    mocks.sweepStaleRinging.mockResolvedValue([row])
    mocks.endReservedCall.mockResolvedValue(false)

    await sweepStaleWhatsappCalls()

    expect(mocks.endReservedCall).toHaveBeenCalledWith({
      wacid: "wacid.GONE",
      auth: { fake: "auth" },
    })
    expect(mocks.finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({ id: "call-1", status: "failed" }),
    )
  })

  test("a stale row with a live control is ended through endReservedCall instead of finalized directly", async () => {
    const row = staleRow({ wacid: "wacid.VOIP" })
    mocks.sweepStaleRinging.mockResolvedValue([row])
    mocks.endReservedCall.mockResolvedValue(true)

    await sweepStaleWhatsappCalls()

    expect(mocks.endReservedCall).toHaveBeenCalledWith({
      wacid: "wacid.VOIP",
      auth: { fake: "auth" },
    })
    expect(mocks.finalizeById).not.toHaveBeenCalled()
    expect(mocks.logInfo).toHaveBeenCalledWith(
      { finalized: 1 },
      "Finalized stale ringing WhatsApp calls",
    )
  })

  test("auth resolution failure for a wacid-carrying row falls back to raw finalize instead of aborting the sweep", async () => {
    const row = staleRow({ wacid: "wacid.VOIP" })
    mocks.sweepStaleRinging.mockResolvedValue([row])
    mocks.resolveVoipAuthByInboxId.mockRejectedValue(new Error("no auth row"))

    await sweepStaleWhatsappCalls()

    expect(mocks.endReservedCall).not.toHaveBeenCalled()
    expect(mocks.logWarn).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "call-1", wacid: "wacid.VOIP" }),
      expect.stringContaining("falling back to a direct finalize"),
    )
    expect(mocks.finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({ id: "call-1", status: "failed" }),
    )
  })

  test("mixed batch: finalizes the wacid-less row and properly ends the live one in the same pass", async () => {
    mocks.sweepStaleRinging.mockResolvedValue([
      staleRow({ id: "call-no-wacid", wacid: null }),
      staleRow({ id: "call-live", wacid: "wacid.VOIP" }),
    ])
    mocks.endReservedCall.mockResolvedValue(true)

    await sweepStaleWhatsappCalls()

    expect(mocks.finalizeById).toHaveBeenCalledTimes(1)
    expect(mocks.finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({ id: "call-no-wacid" }),
    )
    expect(mocks.endReservedCall).toHaveBeenCalledWith({
      wacid: "wacid.VOIP",
      auth: { fake: "auth" },
    })
    expect(mocks.logInfo).toHaveBeenCalledWith(
      { finalized: 2 },
      "Finalized stale ringing WhatsApp calls",
    )
  })
})
