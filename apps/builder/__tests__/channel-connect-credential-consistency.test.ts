// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The OAuth completion legs (the three "select" actions plus the messenger
// reuse-check route) must resolve the platform credential owner from the
// SAME workspaceId the start leg (`/channels/create`) used — never from the
// request host. Those legs run post-relay on the broker or branded host
// interchangeably, so a host-derived completion leg could silently pick a
// different OAuth app than the one the start leg authorized against,
// breaking the token exchange.
//
// Messenger's `connectMessengerPage` (plan §2.4/§4.7) gets its `workspaceId`
// from the encrypted, httpOnly pending-auth cookie — never client input —
// so this test pins that it forwards the COOKIE's workspaceId into
// `resolvePlatformOwnerId`, and that a schema-invalid/missing cookie is
// rejected with a `sessionError` before the resolver is ever called.
// Instagram's two legs (phase 4) now go through the same
// `resolveConnectSession` helper, so they get the identical treatment: the
// wire payload carries only `igId`, never `workspaceId`.
// ---------------------------------------------------------------------------

const {
  mockResolvePlatformOwnerId,
  mockResolveForOwner,
  mockReadPendingAuth,
  mockWorkspaceFind,
  mockIsMember,
} = vi.hoisted(() => ({
  mockResolvePlatformOwnerId: vi.fn(async () => "resolved-owner-1"),
  mockResolveForOwner: vi.fn(async () => undefined),
  mockReadPendingAuth: vi.fn(
    async (): Promise<{
      userToken: string
      workspaceId: string
      referer: string
      version: string
      expiresAt: number
    } | null> => ({
      userToken: "user-token-1",
      workspaceId: "ws-1",
      referer: "/channels/create",
      version: "v23.0",
      expiresAt: Date.now() + 600_000,
    }),
  ),
  mockWorkspaceFind: vi.fn(async () => ({
    id: "ws-1",
    ownerId: "owner-1",
  })),
  mockIsMember: vi.fn(async () => true),
}))

// A passthrough action-client chain: `.inputSchema()`/`.action()` just
// return their handler so the test can call it directly with a hand-built
// `{ ctx, parsedInput }`, without instantiating the real safe-action /
// next-safe-action machinery. Mirrors the pattern in
// `instagram-facebook-settings-actions.test.ts`.
vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: mockResolvePlatformOwnerId,
}))

// Bypassed entirely — this test is about credential-owner resolution, not
// the trial/MAC gate (covered by `messenger-select-page-action.test.ts`).
vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess: vi.fn(async () => null),
  workspaceAccessDenialException: vi.fn(
    (reason: string) => new Error(`denied:${reason}`),
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { resolveForOwner: mockResolveForOwner },
  workspaceService: {
    create: vi.fn(),
    find: mockWorkspaceFind,
  },
  workspaceMemberService: { isMember: mockIsMember },
  resolveTenantSettings: vi.fn(async () => ({ appUrl: "https://app.test" })),
  updateInstagramIntegrationUserInfo: vi.fn(),
  updateMessengerIntegrationUserInfo: vi.fn(),
  messengerIntegrationService: {
    findConnectedPageIds: vi.fn(async () => new Set<string>()),
    connectPage: vi.fn(),
    updateUserInfo: vi.fn(),
  },
  instagramIntegrationService: {
    findConnectedIgIds: vi.fn(async () => new Set<string>()),
    connectAccount: vi.fn(),
    updateUserInfo: vi.fn(),
  },
  tagSyncService: { enqueueChannelScan: vi.fn() },
  userQuotaService: { getAccessState: vi.fn(async () => ({ blocked: false })) },
  connectChannelIntegration: vi.fn(),
  buildContext: vi.fn(async () => ({})),
}))

// The REAL session/item-outcome mapping table — `resolveConnectSession`
// (called by `connectMessengerPage`) throws genuine exceptions from the
// (also real, below) `@chatbotx.io/business/errors`, so this file lets the
// real mapping classify them instead of re-implementing that table as a
// second source of truth that could silently drift from production.
vi.mock("@chatbotx.io/business/inbox/connect-outcome", async (importOriginal) =>
  importOriginal(),
)

vi.mock("@chatbotx.io/business/errors", () => {
  class ChatbotXException extends Error {
    code?: string
    constructor(message: string, code?: string) {
      super(message)
      this.code = code
    }
  }
  return {
    ChatbotXException,
    connectSessionExpiredException: (message: string) =>
      new ChatbotXException(message, "connectSessionExpired"),
    notWorkspaceMemberException: () =>
      new ChatbotXException("not a member", "notWorkspaceMember"),
    credentialMissingException: (message: string) =>
      new ChatbotXException(message, "credentialMissing"),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: vi.fn(async () => undefined) },
  isDatabaseError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return {
    ...actual,
    integrationInstagramModel: {},
    integrationMessengerModel: {},
  }
})

vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: { runChannelHandler: vi.fn() },
  getUserPages: vi.fn(async () => ({
    pages: [
      {
        id: "p1",
        name: "Page",
        access_token: "page-token",
        isConnectable: true,
      },
    ],
    bmLookupFailed: false,
  })),
}))
vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  exchangeLongLivedToken: vi.fn(),
  subscribePageToAppWebhook: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: { runChannelHandler: vi.fn() },
  subscribePageToInstagramWebhook: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: { runChannelHandler: vi.fn() },
  subscribePageToInstagramWebhook: vi.fn(),
}))
vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2" },
  SdkException: class SdkException extends Error {},
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "id-1" }
})
vi.mock("@chatbotx.io/utils/id", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils/id")>()
  return { ...actual, createId: () => "id-1" }
})

vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/features/integration-webchat/lib", () => ({
  BRANDING_TITLE: "ChatbotX",
  getBrandingUrl: vi.fn(() => ""),
}))
vi.mock("@/features/workspaces/actions/upload-logo", () => ({
  updateWorkspaceLogo: vi.fn(),
}))
vi.mock("@/lib/facebook-pending-auth", () => ({
  FB_MESSENGER_PENDING_AUTH_COOKIE: "fb_messenger_pending_auth",
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE:
    "fb_instagram_facebook_pending_auth",
  FB_INSTAGRAM_PENDING_AUTH_COOKIE: "fb_instagram_pending_auth",
  readPendingAuth: mockReadPendingAuth,
}))
vi.mock("@/lib/integration-user-info", () => ({
  persistIntegrationUserInfo: vi.fn(),
}))
vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { connectMessengerPage } = await import(
  "../src/features/integration-messenger/actions/connect-page"
)
const { connectInstagramAccount } = await import(
  "../src/features/integration-instagram/actions/connect-account"
)
const { connectInstagramAccountViaFacebook } = await import(
  "../src/features/integration-instagram/actions/connect-account-facebook"
)

describe("channel connect completion legs never re-derive the credential owner from the host", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolvePlatformOwnerId.mockResolvedValue("resolved-owner-1")
    // Credential missing short-circuits each action right after the
    // resolver call — exactly the point this test needs to observe, without
    // running the rest of the (heavily mocked) connect transaction.
    mockResolveForOwner.mockResolvedValue(undefined)
    mockReadPendingAuth.mockResolvedValue({
      userToken: "user-token-1",
      workspaceId: "ws-1",
      referer: "/channels/create",
      version: "v23.0",
      expiresAt: Date.now() + 600_000,
    })
    mockWorkspaceFind.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
    mockIsMember.mockResolvedValue(true)
  })

  test("connectMessengerPage resolves the credential owner from the pending-auth cookie's workspaceId", async () => {
    await connectMessengerPage({ userId: "user-1", pageId: "p1" }).catch(
      () => undefined,
    )

    expect(mockResolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })

  test("connectInstagramAccount resolves the credential owner from the pending-auth cookie's workspaceId", async () => {
    await connectInstagramAccount({ userId: "user-1", igId: "ig1" }).catch(
      () => undefined,
    )

    expect(mockResolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })

  test("connectInstagramAccountViaFacebook resolves the credential owner from the pending-auth cookie's workspaceId", async () => {
    await connectInstagramAccountViaFacebook({
      userId: "user-1",
      igId: "ig1",
    }).catch(() => undefined)

    expect(mockResolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })

  test("connectMessengerPage never calls the resolver when the pending-auth cookie is missing/schema-invalid", async () => {
    mockReadPendingAuth.mockResolvedValue(null)

    const result = await connectMessengerPage({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "sessionExpired" })
    expect(mockResolvePlatformOwnerId).not.toHaveBeenCalled()
    expect(mockWorkspaceFind).not.toHaveBeenCalled()
  })
})
