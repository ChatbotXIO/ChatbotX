import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  startImport: vi.fn(),
  setCoexist: vi.fn(),
  toastResult: vi.fn(),
}))

vi.mock("@/features/channel-connect/lib/ahachat-import-client", () => ({
  startAhachatImportCall: mocks.startImport,
}))
vi.mock("@/features/channel-connect/lib/coexist-client", () => ({
  setCoexist: mocks.setCoexist,
  coexistUnavailable: () => ({
    ok: false,
    text: "unavailable",
    reported: false,
  }),
}))
vi.mock("@/features/channel-connect/lib/single-connect-toasts", () => ({
  toastCoexistResult: mocks.toastResult,
  toastCoexistSkipped: vi.fn(),
  toastConnectFailure: vi.fn(),
  toastConnectWarning: vi.fn(),
}))

const { connectSingleItem } = await import(
  "@/features/channel-connect/lib/single-connect"
)

const connected = (inboxId?: string) => ({
  kind: "outcome" as const,
  outcome: {
    status: "connected" as const,
    name: "Page One",
    sourceId: "p1",
    integrationId: "integration-1",
    coexistEligible: true,
    ...(inboxId ? { inboxId } : {}),
  },
})

const run = (
  item: { coexist?: boolean; ahachat?: boolean },
  inboxId?: string,
) =>
  connectSingleItem({
    item: {
      id: "p1",
      name: "Page One",
      aiReadsSyncedHistory: true,
      ...item,
    },
    channel: "messenger",
    connectOne: () => Promise.resolve(connected(inboxId)),
    t: (key) => key,
    resolveCoexistWorkspaceId: () => "ws-1",
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.startImport.mockResolvedValue({ ok: true })
  mocks.setCoexist.mockResolvedValue({ ok: true })
})

describe("connectSingleItem: import from AhaChat first", () => {
  test("an import-first row with its inbox starts the contacts import, not a plain history sync", async () => {
    await run({ coexist: true, ahachat: true }, "inbox-1")

    expect(mocks.startImport).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        aiReadsSyncedHistory: true,
      }),
    )
    expect(mocks.setCoexist).not.toHaveBeenCalled()
  })

  test("a history-only row starts the plain history sync", async () => {
    await run({ coexist: true, ahachat: false }, "inbox-1")

    expect(mocks.setCoexist).toHaveBeenCalledTimes(1)
    expect(mocks.startImport).not.toHaveBeenCalled()
  })

  test("an import-first row whose outcome has no inbox id still gets its history sync", async () => {
    await run({ coexist: true, ahachat: true })

    expect(mocks.startImport).not.toHaveBeenCalled()
    expect(mocks.setCoexist).toHaveBeenCalledTimes(1)
  })

  test("a row without the history switch starts neither", async () => {
    await run({ coexist: false, ahachat: true }, "inbox-1")

    expect(mocks.startImport).not.toHaveBeenCalled()
    expect(mocks.setCoexist).not.toHaveBeenCalled()
  })
})
