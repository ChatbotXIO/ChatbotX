// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Pins the recorded behavior change in select-account.action.ts (native
// Instagram login connect): the webhook subscribe and branding call used to
// run INSIDE the same DB transaction as the integration insert. Moving the
// connect's DB body into `connectInstagramAccount` (packages/business has no
// dependency on `@chatbotx.io/integration-instagram`) forces both out of the
// transaction. The webhook subscribe now runs BEFORE the DB write (same
// shape as the Messenger select-page action) so a failed subscribe still
// prevents the connect without leaving an orphaned row; branding stays
// best-effort after the write. This test pins that order.
// ---------------------------------------------------------------------------

const {
  mockResolvePlatformOwnerId,
  mockResolveForOwner,
  mockConnectInstagramAccount,
  mockBuildContext,
  mockSubscribePageToInstagramWebhook,
  mockRunChannelHandler,
  mockUpdateUserInfo,
  mockUpdateWorkspaceLogo,
  mockPersistIntegrationUserInfo,
  mockAuditRecord,
} = vi.hoisted(() => ({
  mockResolvePlatformOwnerId: vi.fn(async () => "owner-1"),
  mockResolveForOwner: vi.fn(),
  mockConnectInstagramAccount: vi.fn(),
  mockBuildContext: vi.fn(async () => ({})),
  mockSubscribePageToInstagramWebhook: vi.fn(),
  mockRunChannelHandler: vi.fn(async () => undefined),
  mockUpdateUserInfo: vi.fn(async () => undefined),
  mockUpdateWorkspaceLogo: vi.fn(async () => undefined),
  mockPersistIntegrationUserInfo: vi.fn(
    async (_props: { persist: (userInfo: unknown) => Promise<unknown> }) =>
      undefined,
  ),
  mockAuditRecord: vi.fn(async () => undefined),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { authActionClient: chain }
})

vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: mockResolvePlatformOwnerId,
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mockBuildContext,
  connectInstagramAccount: mockConnectInstagramAccount,
  instagramIntegrationService: { updateUserInfo: mockUpdateUserInfo },
  platformCredentialService: { resolveForOwner: mockResolveForOwner },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mockAuditRecord },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code?: string
    constructor(message: string, code?: string) {
      super(message)
      this.code = code
    }
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  isDatabaseError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: { runChannelHandler: mockRunChannelHandler },
  subscribePageToInstagramWebhook: mockSubscribePageToInstagramWebhook,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2" },
}))

vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

vi.mock("@/features/integration-webchat/lib", () => ({
  BRANDING_TITLE: "ChatbotX",
  getBrandingUrl: vi.fn(() => "https://app.example.test/branding"),
}))

vi.mock("@/features/workspaces/actions/upload-logo", () => ({
  updateWorkspaceLogo: mockUpdateWorkspaceLogo,
}))

vi.mock("@/lib/integration-user-info", () => ({
  persistIntegrationUserInfo: mockPersistIntegrationUserInfo,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { selectAccountAction } = await import(
  "../src/features/integration-instagram/actions/select-account.action"
)

type ActionHandler = (args: {
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const call = selectAccountAction as unknown as ActionHandler

const integrationRow = {
  id: "ig-1",
  workspaceId: "ws-1",
  auth: {},
}

describe("select-account.action ordering (native Instagram login)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveForOwner.mockResolvedValue({
      config: { clientId: "c1", clientSecret: "s1", version: "v23.0" },
    })
    mockConnectInstagramAccount.mockResolvedValue({
      workspaceId: "ws-1",
      appUrl: "https://app.example.test",
      createdWorkspace: false,
      integrationRow,
      wasCreated: true,
    })
  })

  test("runs webhook subscribe, THEN connectInstagramAccount, THEN branding — not inside one transaction", async () => {
    const callOrder: string[] = []
    mockConnectInstagramAccount.mockImplementation(() => {
      callOrder.push("connectInstagramAccount")
      return Promise.resolve({
        workspaceId: "ws-1",
        appUrl: "https://app.example.test",
        createdWorkspace: false,
        integrationRow,
        wasCreated: true,
      })
    })
    mockSubscribePageToInstagramWebhook.mockImplementation(() => {
      callOrder.push("subscribeWebhook")
      return Promise.resolve(undefined)
    })
    mockRunChannelHandler.mockImplementation(() => {
      callOrder.push("addBranding")
      return Promise.resolve(undefined)
    })

    await call({
      parsedInput: {
        workspaceId: "ws-1",
        igId: "ig-1",
        igName: "IG Account",
        igUsername: "ig_account",
        pageId: "page-1",
        accessToken: "token-1",
        profilePictureUrl: "https://example.test/avatar.png",
      },
      ctx: { user: { id: "user-1" } },
    })

    expect(callOrder).toEqual([
      "subscribeWebhook",
      "connectInstagramAccount",
      "addBranding",
    ])
  })

  test("a failed webhook subscribe prevents the connect — the DB write never runs", async () => {
    mockSubscribePageToInstagramWebhook.mockRejectedValueOnce(
      new Error("webhook subscribe failed"),
    )

    await expect(
      call({
        parsedInput: {
          workspaceId: "ws-1",
          igId: "ig-1",
          igName: "IG Account",
          igUsername: "ig_account",
          pageId: "page-1",
          accessToken: "token-1",
          profilePictureUrl: "https://example.test/avatar.png",
        },
        ctx: { user: { id: "user-1" } },
      }),
    ).rejects.toThrow("Failed to connect Instagram account")

    // The subscribe runs before the DB write, so a failure leaves no
    // orphaned integration/inbox row behind.
    expect(mockConnectInstagramAccount).not.toHaveBeenCalled()
  })

  test("a failed branding write is best-effort and does not fail the action", async () => {
    mockRunChannelHandler.mockRejectedValueOnce(new Error("branding failed"))

    const result = await call({
      parsedInput: {
        workspaceId: "ws-1",
        igId: "ig-1",
        igName: "IG Account",
        igUsername: "ig_account",
        pageId: "page-1",
        accessToken: "token-1",
        profilePictureUrl: "https://example.test/avatar.png",
      },
      ctx: { user: { id: "user-1" } },
    })

    expect(result).toEqual({ integrationId: "ig-1", workspaceId: "ws-1" })
  })
})
