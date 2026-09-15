// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The OAuth completion legs (the three "select" actions) must resolve the
// platform credential from the SAME owner the start leg (`/channels/create`
// or `channels/create/messenger/route.ts`) resolved — never re-derive it
// from the request host. Under the unified `ConnectSession` model this is a
// structural invariant rather than a call-site convention: the session row
// stores `platformOwnerId` once, at creation time, and every completion leg
// (`resolveConnectSession`) reads it straight off that row — there is no
// `resolvePlatformOwnerId`/host-derived re-resolution step in the
// completion leg to drift. This test pins that `platformCredentialService
// .resolveForOwner` is called with the SESSION's stored owner, and that a
// missing/expired session short-circuits before any credential lookup.
// ---------------------------------------------------------------------------

const { mockFindById, mockResolveForOwner, mockWorkspaceFind, mockIsMember } =
  vi.hoisted(() => ({
    mockFindById: vi.fn(),
    mockResolveForOwner: vi.fn(async () => undefined),
    mockWorkspaceFind: vi.fn(async () => ({
      id: "ws-1",
      ownerId: "owner-1",
    })),
    mockIsMember: vi.fn(async () => true),
  }))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: { findById: mockFindById },
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
    findByInboxId: vi.fn(),
  },
  instagramIntegrationService: {
    findConnectedIgIds: vi.fn(async () => new Set<string>()),
    connectAccount: vi.fn(),
    updateUserInfo: vi.fn(),
    findByInboxId: vi.fn(),
  },
  tagSyncService: { enqueueChannelScan: vi.fn() },
  userQuotaService: { getAccessState: vi.fn(async () => ({ blocked: false })) },
  connectChannelIntegration: vi.fn(),
  buildContext: vi.fn(async () => ({})),
}))

// The real connect actions never reach `connectionService.connectTargets` in
// this test — `mockResolveForOwner` defaults to `undefined`, so
// `resolveConnectSession` throws `credentialMissingException` first — this
// stub only satisfies the module import.
vi.mock("@chatbotx.io/connections", () => ({
  connectionService: { connectTargets: vi.fn() },
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

vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: { runChannelHandler: vi.fn() },
}))
vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: { runChannelHandler: vi.fn() },
}))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: { runChannelHandler: vi.fn() },
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

const session = {
  id: "session-1",
  workspaceId: "ws-1",
  platformOwnerId: "owner-1",
  provider: "messenger",
  status: "awaiting_selection",
  targets: [{ id: "p1", name: "Page", selectable: true }],
}

describe("channel connect completion legs never re-derive the credential owner from the host", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Credential missing short-circuits each action right after the
    // resolver call — exactly the point this test needs to observe, without
    // running the rest of the (heavily mocked) connect transaction.
    mockResolveForOwner.mockResolvedValue(undefined)
    mockFindById.mockResolvedValue(session)
    mockWorkspaceFind.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
    mockIsMember.mockResolvedValue(true)
  })

  test("connectMessengerPage resolves the credential from the session's stored platformOwnerId", async () => {
    await connectMessengerPage({
      userId: "user-1",
      sessionId: "session-1",
      pageId: "p1",
    }).catch(() => undefined)

    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "messenger",
    })
  })

  test("connectInstagramAccount resolves the credential from the session's stored platformOwnerId", async () => {
    await connectInstagramAccount({
      userId: "user-1",
      sessionId: "session-1",
      igId: "ig1",
    }).catch(() => undefined)

    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "instagram",
    })
  })

  test("connectInstagramAccountViaFacebook resolves the credential from the session's stored platformOwnerId", async () => {
    await connectInstagramAccountViaFacebook({
      userId: "user-1",
      sessionId: "session-1",
      igId: "ig1",
    }).catch(() => undefined)

    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "instagramFacebook",
    })
  })

  test("connectMessengerPage never calls the credential resolver when the session is missing/expired", async () => {
    mockFindById.mockResolvedValue(null)

    const result = await connectMessengerPage({
      userId: "user-1",
      sessionId: "session-1",
      pageId: "p1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "sessionExpired" })
    expect(mockResolveForOwner).not.toHaveBeenCalled()
    expect(mockWorkspaceFind).not.toHaveBeenCalled()
  })
})
