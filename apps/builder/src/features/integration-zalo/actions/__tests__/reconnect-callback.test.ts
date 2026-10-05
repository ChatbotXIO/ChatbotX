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
const reconnectInbox = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  zaloIntegrationService: {
    findById,
    updateAuth,
  },
  connectionStateService: {
    reconnectInbox,
  },
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  authExpiresAtOf: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/database/client — `db.transaction` mimics Drizzle's real
// semantics closely enough for this test: it runs the callback against one
// shared `tx` handle and forwards whatever the callback does (resolve/reject).
// ---------------------------------------------------------------------------
const SENTINEL_TX = { __tx: true }
const dbTransaction = vi.fn(
  async (callback: (tx: unknown) => unknown) => await callback(SENTINEL_TX),
)
vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: dbTransaction },
}))

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
  dbTransaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) => await callback(SENTINEL_TX),
  )
  findById.mockResolvedValue({
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    inboxId: "inbox-1",
    oaId: "oa-1",
  })
  updateAuth.mockResolvedValue(undefined)
  reconnectInbox.mockResolvedValue(undefined)
  handleRequest.mockResolvedValue({
    oaId: "oa-1",
    metadata: { oaName: "My OA" },
  })
})

describe("reconnectZaloHandler — Part 1: transaction atomicity", () => {
  test("wraps the auth write and reconnectInbox in one shared transaction", async () => {
    await invoke()

    expect(dbTransaction).toHaveBeenCalledTimes(1)
    // Positional call: (id, auth, name, tx) — the 4th positional arg is the tx.
    expect(updateAuth).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({ oaId: "oa-1" }),
      "My OA",
      SENTINEL_TX,
    )
    expect(reconnectInbox).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
  })

  test("rolls back the whole reconnect when reconnectInbox fails after the auth write (e.g. channelLimitReached)", async () => {
    const channelLimitReached = Object.assign(
      new Error("Channel limit reached"),
      { code: "channelLimitReached" },
    )
    reconnectInbox.mockRejectedValue(channelLimitReached)

    const result = await invoke()

    expect(result).toEqual({ status: "error", reason: "failed" })
    // Both writes ran through the SAME transaction boundary, so the thrown
    // error aborts the whole thing — there is no "auth saved, inbox state
    // stale" partial outcome for the real DB to commit.
    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(updateAuth).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({ oaId: "oa-1" }),
      "My OA",
      SENTINEL_TX,
    )
  })
})
