import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  clientErrorHandler: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: { contactSyncAPIs: { startContactImport: mocks.start } },
}))
vi.mock("@/lib/errors/client-handler", () => ({
  clientErrorHandler: mocks.clientErrorHandler,
}))

const { startAhachatImportCall, ahachatImportChannelOf } = await import(
  "@/features/channel-connect/lib/ahachat-import-client"
)

const t = (key: string) => key
const PARAMS = {
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  aiReadsSyncedHistory: true,
  t,
}

const pageResult = (
  outcome: "started" | "attached" | "fallback",
  historyStarted = false,
) => ({
  runId: outcome === "started" ? "run-1" : null,
  pages: [
    {
      inboxId: "inbox-1",
      outcome,
      fallbackReason: outcome === "fallback" ? "notInAhachat" : null,
      historyStarted,
    },
  ],
})

describe("ahachatImportChannelOf", () => {
  test("supports Messenger and Instagram, never WhatsApp, Zalo or Telegram", () => {
    expect(ahachatImportChannelOf("messenger")).toBe("messenger")
    expect(ahachatImportChannelOf("instagram")).toBe("instagram")
    expect(ahachatImportChannelOf("whatsapp")).toBeNull()
  })
})

describe("startAhachatImportCall", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("asks for the contacts import of the page with the row's own AI choice", async () => {
    mocks.start.mockResolvedValue(pageResult("started"))

    await expect(startAhachatImportCall(PARAMS)).resolves.toEqual({ ok: true })

    expect(mocks.start).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      pages: [{ inboxId: "inbox-1", aiReadsSyncedHistory: true }],
    })
  })

  test.each([
    ["started", false],
    ["attached", false],
    ["fallback", true],
  ] as const)("is ok when the page is %s (history started: %s)", async (outcome, historyStarted) => {
    mocks.start.mockResolvedValue(pageResult(outcome, historyStarted))

    await expect(startAhachatImportCall(PARAMS)).resolves.toEqual({ ok: true })
  })

  test("an answer with no page at all is a failure the row can show", async () => {
    mocks.start.mockResolvedValue({ runId: null, pages: [] })

    await expect(startAhachatImportCall(PARAMS)).resolves.toMatchObject({
      ok: false,
      text: "ahachatImport.errors.historyNotStarted",
    })
  })

  test("a page that fell back without a history sync is a failure the row can show and retry", async () => {
    mocks.start.mockResolvedValue(pageResult("fallback", false))

    await expect(startAhachatImportCall(PARAMS)).resolves.toEqual({
      ok: false,
      text: "ahachatImport.errors.historyNotStarted",
      reported: false,
    })
  })

  test("a request failure is reported once and translated for the row", async () => {
    const error = new Error("network")
    mocks.start.mockRejectedValue(error)

    await expect(startAhachatImportCall(PARAMS)).resolves.toEqual({
      ok: false,
      text: "ahachatImport.errors.unknown",
      reported: true,
    })
    expect(mocks.clientErrorHandler).toHaveBeenCalledWith(error)
  })
})
