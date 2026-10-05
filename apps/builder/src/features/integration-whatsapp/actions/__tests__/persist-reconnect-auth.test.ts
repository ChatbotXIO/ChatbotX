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
const replaceAuth = vi.fn()
const reconnectInbox = vi.fn()
const upsertCurrentCredential = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: {
    reconnectInbox,
  },
  integrationWhatsappService: {
    replaceAuth,
  },
  platformCredentialService: {},
  WHATSAPP_CAPI_SCOPE: "whatsapp_business_messaging",
  whatsappBusinessAccountService: {
    upsertCurrentCredential,
  },
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  authExpiresAtOf: vi.fn(() => null),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
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
// Mock the rest of the WhatsApp API surface this module imports, none of
// which `persistReconnectAuthAndResubscribe` itself calls, but the module
// must still load cleanly.
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/integration-whatsapp/api/auth", () => ({
  appAccessToken: vi.fn(),
  exchangeAccessToken: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-whatsapp/api/phone-number", () => ({
  listPhoneNumbers: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-whatsapp/api/waba", () => ({
  findWaba: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-whatsapp/api/waba-owner", () => ({
  resolveOwningWabaId: vi.fn(),
}))
const subscribeWebhook = vi.fn()
vi.mock("@chatbotx.io/integration-whatsapp/api/webhook", () => ({
  subscribeWebhook,
}))
vi.mock("@chatbotx.io/utils", () => ({
  zodBigintAsString: vi.fn(() => ({})),
}))
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock("@/features/integration-whatsapp/libs/capi-scope", () => ({
  getWhatsappGrantedScopes: vi.fn(async () => []),
}))
vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: vi.fn(),
}))
vi.mock("@/lib/provider-origin", () => ({
  resolveProviderOriginForCredential: vi.fn(),
}))
vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({
        action: () => vi.fn(),
      }),
    }),
  },
}))
vi.mock("../../libs/embedded-signup", () => ({
  WHATSAPP_OAUTH_CALLBACK_PATH: "/callback",
}))
vi.mock("../webhook-url", () => ({
  buildAuthValue: vi.fn(),
  buildWebhookConfig: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Dynamic import is required here (not a static-import violation): vi.mock()
// factories above are hoisted above static imports, so the module under test
// must be loaded with `await import()` after they register, or it would pick
// up the real, unmocked dependencies.
// ---------------------------------------------------------------------------
const { persistReconnectAuthAndResubscribe } = await import(
  "../reconnect.action"
)

const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"

function baseInput() {
  return {
    auth: { metadata: { wabaId: "waba-1" } } as never,
    hasCapiScope: true,
    grantedScopes: ["whatsapp_business_messaging"],
    businessId: "business-1",
    accessToken: "access-token",
    apiVersion: "v19.0",
    wabaId: "waba-1",
    integrationWhatsappId: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    inboxId: "inbox-1",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  dbTransaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) => await callback(SENTINEL_TX),
  )
  replaceAuth.mockResolvedValue({ id: INTEGRATION_ID })
  reconnectInbox.mockResolvedValue(undefined)
  upsertCurrentCredential.mockResolvedValue(undefined)
  subscribeWebhook.mockResolvedValue(undefined)
})

describe("persistReconnectAuthAndResubscribe — Part 1: transaction atomicity", () => {
  test("wraps the auth write and reconnectInbox in one shared transaction", async () => {
    await persistReconnectAuthAndResubscribe(baseInput())

    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(replaceAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
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

    await expect(
      persistReconnectAuthAndResubscribe(baseInput()),
    ).rejects.toThrow("Channel limit reached")

    // Both writes ran through the SAME transaction boundary, so the thrown
    // error aborts the whole thing — there is no "auth saved, inbox state
    // stale" partial outcome for the real DB to commit.
    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(replaceAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
    // A failed transaction must abort before any post-commit follow-up
    // (WABA credential cache, webhook resubscribe) runs.
    expect(upsertCurrentCredential).not.toHaveBeenCalled()
    expect(subscribeWebhook).not.toHaveBeenCalled()
  })
})
