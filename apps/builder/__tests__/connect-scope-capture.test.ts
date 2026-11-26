// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  captureInboxScopes: vi.fn(async () => undefined),
  debugToken: vi.fn(),
  runBrandingFollowUps: vi.fn(async () => undefined),
  tagSync: vi.fn(async () => undefined),
  warn: vi.fn(),
}))

type Follow = (input: { row: unknown; session: unknown }) => Promise<void>
const followUps: Record<string, Follow> = {}

vi.mock("server-only", () => ({}))
vi.mock("@/lib/log", () => ({ logger: { warn: mocks.warn } }))
vi.mock("@chatbotx.io/business", () => ({
  instagramIntegrationService: {
    findByInboxId: vi.fn(),
    seedPersistentMenu: vi.fn(),
  },
  messengerIntegrationService: {
    findByInboxId: vi.fn(),
    seedPersistentMenu: vi.fn(),
  },
  publishDestinationService: { captureInboxScopes: mocks.captureInboxScopes },
  tagSyncService: { enqueueChannelScan: mocks.tagSync },
}))
vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: {},
  toAppAccessToken: () => "app-token",
}))
vi.mock("@chatbotx.io/integration-messenger/apis/token-scopes", () => ({
  readTokenScopes: mocks.debugToken,
}))
vi.mock("@chatbotx.io/integration-instagram", () => ({ integration: {} }))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: {},
}))
vi.mock("@/features/channel-connect/lib/branding-follow-ups", () => ({
  runBrandingFollowUps: mocks.runBrandingFollowUps,
}))
vi.mock("@/features/channel-connect/lib/connect-session-candidate", () => ({
  connectSessionCandidate: vi.fn(
    (props: { provider: string; runFollowUps: Follow }) => {
      followUps[props.provider] = props.runFollowUps
      return Promise.resolve({ kind: "outcome" })
    },
  ),
}))

const { connectMessengerPage } = await import(
  "@/features/integration-messenger/actions/connect-page"
)
const { connectInstagramAccount } = await import(
  "@/features/integration-instagram/actions/connect-account"
)
const { connectInstagramAccountViaFacebook } = await import(
  "@/features/integration-instagram/actions/connect-account-facebook"
)

const session = { workspace: { id: "ws-1" } }
const row = (auth: unknown, extra = {}) => ({
  auth,
  id: "int-1",
  inboxId: "inbox-1",
  persistentMenus: [],
  ...extra,
})

beforeEach(async () => {
  vi.clearAllMocks()
  await connectMessengerPage({ pageId: "p", sessionId: "s", userId: "u" })
  await connectInstagramAccount({ igId: "i", sessionId: "s", userId: "u" })
  await connectInstagramAccountViaFacebook({
    igId: "i",
    sessionId: "s",
    userId: "u",
  })
})

describe("scope capture at first connect", () => {
  test("Instagram Login stores the permissions carried from the code exchange", async () => {
    await followUps.instagram?.({
      row: row({ metadata: { grantedScopes: ["instagram_business_basic"] } }),
      session,
    })

    expect(mocks.captureInboxScopes).toHaveBeenCalledWith({
      grantedScopes: ["instagram_business_basic"],
      inboxId: "inbox-1",
      publisherKey: "instagram",
      workspaceId: "ws-1",
    })
  })

  test("Instagram Login without reported permissions stores unknown (null)", async () => {
    await followUps.instagram?.({ row: row({ metadata: {} }), session })

    expect(mocks.captureInboxScopes).toHaveBeenCalledWith(
      expect.objectContaining({
        grantedScopes: null,
        publisherKey: "instagram",
      }),
    )
  })

  test("Instagram via Facebook stores the login's permissions recorded on the candidate", async () => {
    await followUps.instagramFacebook?.({
      row: row({ metadata: { grantedScopes: ["instagram_content_publish"] } }),
      session,
    })

    expect(mocks.captureInboxScopes).toHaveBeenCalledWith({
      grantedScopes: ["instagram_content_publish"],
      inboxId: "inbox-1",
      publisherKey: "instagramFacebook",
      workspaceId: "ws-1",
    })
  })

  test("Messenger stores the debug_token scopes of the page token", async () => {
    mocks.debugToken.mockResolvedValue({
      kind: "scopes",
      scopes: ["pages_manage_posts"],
    })

    await followUps.messenger?.({
      row: row({
        clientId: "app",
        clientSecret: "secret",
        tokens: { accessToken: "page-token" },
        version: "v23.0",
      }),
      session,
    })

    expect(mocks.debugToken).toHaveBeenCalledWith({
      appAccessToken: "app-token",
      inputToken: "page-token",
      version: "v23.0",
    })
    expect(mocks.captureInboxScopes).toHaveBeenCalledWith(
      expect.objectContaining({
        grantedScopes: ["pages_manage_posts"],
        publisherKey: "facebook",
      }),
    )
  })

  test("Messenger stores null when debug_token fails, and the connect still proceeds", async () => {
    mocks.debugToken.mockResolvedValue({ kind: "failed" })

    await followUps.messenger?.({
      row: row({
        clientId: "app",
        clientSecret: "secret",
        tokens: { accessToken: "page-token" },
        version: "v23.0",
      }),
      session,
    })

    expect(mocks.captureInboxScopes).toHaveBeenCalledWith(
      expect.objectContaining({ grantedScopes: null }),
    )
    expect(mocks.runBrandingFollowUps).toHaveBeenCalled()
  })

  test("a failing capture never fails the follow-up and logs no token", async () => {
    mocks.captureInboxScopes.mockRejectedValueOnce(new Error("db"))

    await expect(
      followUps.instagram?.({
        row: row({
          metadata: { grantedScopes: ["x"] },
          tokens: { accessToken: "secret-token" },
        }),
        session,
      }),
    ).resolves.toBeUndefined()

    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("secret-token")
  })
})
