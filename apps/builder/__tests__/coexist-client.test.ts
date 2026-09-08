import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  setCoexistMessengerAPI,
  setCoexistInstagramAPI,
  setCoexistWhatsappAPI,
  mockClientErrorHandler,
} = vi.hoisted(() => ({
  setCoexistMessengerAPI: vi.fn(),
  setCoexistInstagramAPI: vi.fn(),
  setCoexistWhatsappAPI: vi.fn(),
  mockClientErrorHandler: vi.fn(),
}))

// The typed oRPC client, not `ky`: the coexist procedures are
// session-authenticated, and `/api` now serves `publicRouter` alone.
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    integrationMessengerAPIs: { setCoexistMessengerAPI },
    integrationInstagramAPIs: { setCoexistInstagramAPI },
    integrationWhatsappAPIs: { setCoexistWhatsappAPI },
  },
}))
vi.mock("@/lib/errors/client-handler", () => ({
  clientErrorHandler: mockClientErrorHandler,
}))

const { setCoexist } = await import(
  "@/features/channel-connect/lib/coexist-client"
)

/** Echoes the key back so assertions never depend on the English copy. */
const t = (key: string) => key

function respondWith(response: unknown) {
  setCoexistMessengerAPI.mockResolvedValue(response)
}

const params = {
  workspaceId: "ws-1",
  channel: "messenger",
  integrationId: "int-1",
  enabled: true,
  aiReadsSyncedHistory: false,
  t,
} as const

describe("setCoexist (coexist client)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("calls the channel's own coexist procedure with the exact request body", async () => {
    respondWith({ success: true })

    await setCoexist({ ...params, aiReadsSyncedHistory: true })

    expect(setCoexistMessengerAPI).toHaveBeenCalledTimes(1)
    expect(setCoexistMessengerAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-1",
      enabled: true,
      aiReadsSyncedHistory: true,
    })
    // One channel per call — never a second channel's procedure as well.
    expect(setCoexistInstagramAPI).not.toHaveBeenCalled()
    expect(setCoexistWhatsappAPI).not.toHaveBeenCalled()
  })

  // A channel silently routed to another channel's procedure would enable
  // coexist on the wrong integration, and every response shape is identical,
  // so no type or assertion downstream would notice.
  test.each([
    ["instagram", () => setCoexistInstagramAPI],
    ["whatsapp", () => setCoexistWhatsappAPI],
  ] as const)("%s dispatches to its own procedure", async (channel, getMock) => {
    getMock().mockResolvedValue({ success: true })

    await expect(setCoexist({ ...params, channel })).resolves.toEqual({
      ok: true,
    })

    expect(getMock()).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-1",
      enabled: true,
      aiReadsSyncedHistory: false,
    })
    expect(setCoexistMessengerAPI).not.toHaveBeenCalled()
  })

  test("a successful response is `{ ok: true }`", async () => {
    respondWith({ success: true })

    await expect(setCoexist(params)).resolves.toEqual({ ok: true })
  })

  test("`msg` wins over a known reason, and the failure is not yet reported", async () => {
    respondWith({ success: false, reason: "not_eligible", msg: "From Meta" })

    await expect(setCoexist(params)).resolves.toEqual({
      ok: false,
      text: "From Meta",
      reported: false,
    })
  })

  test("a known reason maps to its translated copy", async () => {
    respondWith({ success: false, reason: "window_expired" })

    await expect(setCoexist(params)).resolves.toEqual({
      ok: false,
      text: "coexist.errors.windowExpired",
      reported: false,
    })
  })

  test("an unknown reason falls back to the generic copy", async () => {
    respondWith({ success: false, reason: "something_else" })

    await expect(setCoexist(params)).resolves.toEqual({
      ok: false,
      text: "coexist.errors.unknown",
      reported: false,
    })
  })

  test("a thrown call is handed to clientErrorHandler and comes back already reported", async () => {
    const error = new Error("network down")
    setCoexistMessengerAPI.mockRejectedValue(error)

    await expect(setCoexist(params)).resolves.toEqual({
      ok: false,
      text: "coexist.errors.unknown",
      // `clientErrorHandler` already toasted this one — callers must not
      // announce it a second time.
      reported: true,
    })
    expect(mockClientErrorHandler).toHaveBeenCalledWith(error)
  })
})
