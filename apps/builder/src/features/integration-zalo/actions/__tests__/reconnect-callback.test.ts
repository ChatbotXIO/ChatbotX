// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock logger to suppress output
// ---------------------------------------------------------------------------
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/business
// ---------------------------------------------------------------------------
const findById = vi.fn()
const updateAuth = vi.fn()
const commitReconnect = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  zaloIntegrationService: {
    findById,
    updateAuth,
  },
  connectionStateService: {
    commitReconnect,
  },
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  authExpiresAtOf: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// `commitReconnect` owns opening the transaction internally (see
// `ConnectionStateService.commitReconnect`'s own unit tests for that); this
// mock models the one contract this handler relies on: it invokes the
// supplied `writeAuth(tx)` exactly once with a shared tx handle.
// ---------------------------------------------------------------------------
const SENTINEL_TX = { __tx: true }
// ---------------------------------------------------------------------------
// Mock @/integration (the per-channel SDK registry `integrations.zalo`)
// ---------------------------------------------------------------------------
const handleRequest = vi.fn()
vi.mock("@/integration", () => ({
  integrations: {
    zalo: { handleRequest },
  },
}))

// ---------------------------------------------------------------------------
// Dynamic import is required here (not a static-import violation): vi.mock()
// factories above are hoisted above static imports, so the module under test
// must be loaded with `await import()` after they register, or it would pick
// up the real, unmocked dependencies.
// ---------------------------------------------------------------------------
const { reconnectZaloHandler } = await import("../reconnect-callback")

const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"

function invoke() {
  return reconnectZaloHandler({
    zaloSettings: {
      appId: "app-id",
      secretKey: "secret-key",
    } as never,
    workspaceId: WORKSPACE_ID,
    integrationId: INTEGRATION_ID,
    req: new Request("https://app.example/callback"),
    callbackUrl: "https://app.example/callback",
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  commitReconnect.mockImplementation(
    async ({ writeAuth }: { writeAuth: (tx: unknown) => Promise<void> }) =>
      await writeAuth(SENTINEL_TX),
  )
  findById.mockResolvedValue({
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    inboxId: "inbox-1",
    oaId: "oa-1",
  })
  updateAuth.mockResolvedValue(undefined)
  handleRequest.mockResolvedValue({
    oaId: "oa-1",
    metadata: { oaName: "My OA" },
  })
})

describe("reconnectZaloHandler — Part 1: transaction atomicity", () => {
  test("calls commitReconnect with the inbox/workspace/auth and a writeAuth that persists the satellite row through the shared tx", async () => {
    await invoke()

    expect(commitReconnect).toHaveBeenCalledTimes(1)
    expect(commitReconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "inbox-1",
        workspaceId: WORKSPACE_ID,
      }),
    )
    // Positional call: (id, auth, name, tx) — the 4th positional arg is the tx.
    expect(updateAuth).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({ oaId: "oa-1" }),
      "My OA",
      SENTINEL_TX,
    )
  })

  test("propagates a commitReconnect failure (e.g. channelLimitReached from the inbox re-check) as a failed reconnect", async () => {
    const channelLimitReached = Object.assign(
      new Error("Channel limit reached"),
      { code: "channelLimitReached" },
    )
    commitReconnect.mockImplementation(async ({ writeAuth }) => {
      await writeAuth(SENTINEL_TX)
      throw channelLimitReached
    })

    const result = await invoke()

    expect(result).toEqual({ status: "error", reason: "failed" })
    expect(commitReconnect).toHaveBeenCalledTimes(1)
    expect(updateAuth).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({ oaId: "oa-1" }),
      "My OA",
      SENTINEL_TX,
    )
  })
})
