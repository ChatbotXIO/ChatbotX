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
const commitReconnect = vi.fn()
const upsertCurrentCredential = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: {
    commitReconnect,
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
// `commitReconnect` owns opening the transaction internally (see
// `ConnectionStateService.commitReconnect`'s own unit tests for that); this
// mock models the one contract this module relies on: it invokes the
// supplied `writeAuth(tx)` exactly once with a shared tx handle.
// ---------------------------------------------------------------------------
const SENTINEL_TX = { __tx: true }

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
  commitReconnect.mockImplementation(
    async ({ writeAuth }: { writeAuth: (tx: unknown) => Promise<void> }) =>
      await writeAuth(SENTINEL_TX),
  )
  replaceAuth.mockResolvedValue({ id: INTEGRATION_ID })
  upsertCurrentCredential.mockResolvedValue(undefined)
  subscribeWebhook.mockResolvedValue(undefined)
})

describe("persistReconnectAuthAndResubscribe — Part 1: transaction atomicity", () => {
  test("calls commitReconnect with the inbox/workspace/auth and a writeAuth that persists the auth row through the shared tx", async () => {
    await persistReconnectAuthAndResubscribe(baseInput())

    expect(commitReconnect).toHaveBeenCalledTimes(1)
    expect(commitReconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "inbox-1",
        workspaceId: WORKSPACE_ID,
      }),
    )
    expect(replaceAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
  })

  test("propagates a commitReconnect failure (e.g. channelLimitReached from the inbox re-check) as a rejected reconnect", async () => {
    const channelLimitReached = Object.assign(
      new Error("Channel limit reached"),
      { code: "channelLimitReached" },
    )
    commitReconnect.mockImplementation(async ({ writeAuth }) => {
      await writeAuth(SENTINEL_TX)
      throw channelLimitReached
    })

    await expect(
      persistReconnectAuthAndResubscribe(baseInput()),
    ).rejects.toThrow("Channel limit reached")

    expect(commitReconnect).toHaveBeenCalledTimes(1)
    expect(replaceAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
    // A failed commitReconnect must abort before any post-commit follow-up
    // (WABA credential cache, webhook resubscribe) runs.
    expect(upsertCurrentCredential).not.toHaveBeenCalled()
    expect(subscribeWebhook).not.toHaveBeenCalled()
  })
})
