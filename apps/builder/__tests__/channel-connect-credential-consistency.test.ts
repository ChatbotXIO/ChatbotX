// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The OAuth completion legs (the three "select" actions plus the messenger
// reuse-check route) must resolve the platform credential owner from the
// SAME workspaceId the start leg (`/channels/create`) used — never from the
// request host. Those legs run post-relay on the broker or branded host
// interchangeably, so a host-derived completion leg could silently pick a
// different OAuth app than the one the start leg authorized against,
// breaking the token exchange. This test pins that each completion leg
// forwards `parsedInput.workspaceId` into `resolvePlatformOwnerId`/
// `resolveOwnerForWorkspace` unchanged, rather than re-deriving it.
// ---------------------------------------------------------------------------

const { mockResolvePlatformOwnerId, mockResolveForOwner } = vi.hoisted(() => ({
  mockResolvePlatformOwnerId: vi.fn(async () => "resolved-owner-1"),
  mockResolveForOwner: vi.fn(async () => undefined),
}))

// A passthrough action-client chain: `.inputSchema()`/`.action()` just
// return their handler so the test can call it directly with a hand-built
// `{ ctx, parsedInput }`, without instantiating the real safe-action /
// next-safe-action machinery. Mirrors the pattern in
// `instagram-facebook-settings-actions.test.ts`.
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
  platformCredentialService: { resolveForOwner: mockResolveForOwner },
  workspaceService: { create: vi.fn() },
  resolveTenantSettings: vi.fn(),
  updateInstagramIntegrationUserInfo: vi.fn(),
  updateMessengerIntegrationUserInfo: vi.fn(),
  tagSyncService: { enqueueChannelScan: vi.fn() },
  userQuotaService: { getAccessState: vi.fn(async () => ({ blocked: false })) },
  connectChannelIntegration: vi.fn(),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

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
  readPendingAuth: vi.fn(async () => null),
}))
vi.mock("@/lib/integration-user-info", () => ({
  persistIntegrationUserInfo: vi.fn(),
}))
vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { selectPageAction } = await import(
  "../src/features/integration-messenger/actions/select-page.action"
)
const { selectAccountAction } = await import(
  "../src/features/integration-instagram/actions/select-account.action"
)
const { selectFacebookAccountAction } = await import(
  "../src/features/integration-instagram/actions/select-account-facebook.action"
)

type ActionHandler = (args: {
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const call = (action: unknown) => action as ActionHandler

describe("channel connect completion legs never re-derive the credential owner from the host", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolvePlatformOwnerId.mockResolvedValue("resolved-owner-1")
    // Credential missing short-circuits each action right after the
    // resolver call — exactly the point this test needs to observe, without
    // running the rest of the (heavily mocked) connect transaction.
    mockResolveForOwner.mockResolvedValue(undefined)
  })

  test("select-page.action (messenger) forwards workspaceId unchanged", async () => {
    await call(selectPageAction)({
      parsedInput: { workspaceId: "ws-1", pageId: "p1", pageName: "Page" },
      ctx: { user: { id: "user-1" } },
    }).catch(() => undefined)

    expect(mockResolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })

  test("select-account.action (instagram) forwards workspaceId unchanged", async () => {
    await call(selectAccountAction)({
      parsedInput: { workspaceId: "ws-1", igId: "ig1", igName: "IG" },
      ctx: { user: { id: "user-1" } },
    }).catch(() => undefined)

    expect(mockResolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })

  test("select-account-facebook.action (instagram via Facebook) forwards workspaceId unchanged", async () => {
    await call(selectFacebookAccountAction)({
      parsedInput: { workspaceId: "ws-1", igId: "ig1", igName: "IG" },
      ctx: { user: { id: "user-1" } },
    }).catch(() => undefined)

    expect(mockResolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })

  test("no-workspace-yet connects (first channel ever) forward a nullish workspaceId, not a guessed one", async () => {
    await call(selectPageAction)({
      parsedInput: { workspaceId: undefined, pageId: "p1", pageName: "Page" },
      ctx: { user: { id: "user-1" } },
    }).catch(() => undefined)

    expect(mockResolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: undefined,
    })
  })
})
