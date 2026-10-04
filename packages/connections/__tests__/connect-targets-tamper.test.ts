import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

// ---------------------------------------------------------------------------
// `ConnectSession.encryptedAuth` replaces the `fb_*_pending_auth` cookies
// this PR deleted (see `packages/database/src/schema/connect-session.ts`'s
// docstring) — and with them, the only tests that proved a tampered
// ciphertext is rejected rather than silently decrypted
// (`facebook-pending-auth.test.ts`, deleted in 6c05ed880). This exercises
// the REAL `@chatbotx.io/encryption` primitives (ENCRYPTION_KEY is seeded by
// `@chatbotx.io/vitest-config`'s node preset) against `connectTargets`,
// which is the one place `ConnectSession.encryptedAuth` is read back and
// decrypted, so the tamper-detection case is a genuine AES-GCM auth-tag
// failure, not a mocked one.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findByIdForWorkspace: vi.fn(),
  claimTarget: vi.fn(),
  releaseTarget: vi.fn(),
  recordResults: vi.fn(),
  resolveAdapter: vi.fn(),
  resolveOwnerId: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  inboxService: { create: vi.fn() },
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    claimTarget: mocks.claimTarget,
    releaseTarget: mocks.releaseTarget,
    recordResults: mocks.recordResults,
  },
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  connectionStateService: {},
  isActiveConnectionStatus: () => false,
}))

class MockChatbotXException extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: MockChatbotXException,
  connectionAlreadyConnectedException: () =>
    new MockChatbotXException(
      "already connected",
      "connectionAlreadyConnected",
    ),
  connectionCredentialsRejectedException: (message: string) =>
    new MockChatbotXException(message, "connectionCredentialsRejected"),
  connectionIdentityMismatchException: () =>
    new MockChatbotXException(
      "identity mismatch",
      "connectionIdentityMismatch",
    ),
  connectionNoCandidatesException: () =>
    new MockChatbotXException("no candidates", "connectionNoCandidates"),
  connectionNotConfiguredException: (provider: string) =>
    new MockChatbotXException(`${provider} not configured`, "notConfigured"),
  connectionNotOAuthException: () =>
    new MockChatbotXException("not oauth", "connectionNotOAuth"),
  connectionStateMismatchException: () =>
    new MockChatbotXException("state mismatch", "connectionStateMismatch"),
  connectSessionExpiredException: (message: string) =>
    new MockChatbotXException(message, "connectSessionExpired"),
  notFoundException: (message: string) =>
    new MockChatbotXException(message, "notFound"),
  toPublicErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { findByProviderSourceId: vi.fn() },
}))

// Re-declared rather than importing the real `./internal` — that module
// also pulls in `./registry` (every `integrations/<provider>` package),
// none of which this test needs: the tamper case throws before any of
// `internal.ts`'s other exports (`resolveAdapter`, `upsertConnectionRow`,
// …) are ever called.
const encryptedCandidatesSchema = z.array(
  z.object({
    sourceId: z.string(),
    displayName: z.string(),
    authExpiresAt: z.string().optional(),
    avatarUrl: z.string().optional(),
    alreadyConnected: z.enum(["this_workspace", "other_workspace"]).optional(),
    auth: z.unknown(),
  }),
)

vi.mock("../src/internal", () => ({
  encryptedCandidatesSchema,
  resolveAdapter: mocks.resolveAdapter,
  resolveForeignKey: vi.fn(),
  resolveOwnerId: mocks.resolveOwnerId,
  subscribeWebhookBestEffort: vi.fn(),
  toChannelType: vi.fn(),
  upsertConnectionRow: vi.fn(),
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { connectTargets } = await import("../src/connect-targets")
const { encryptUtils } = await import("@chatbotx.io/encryption")

const baseSession = {
  id: "session-1",
  workspaceId: "ws-1",
  provider: "messenger",
  status: "awaiting_selection",
  targets: [{ id: "page-1", name: "Page One", selectable: true }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveAdapter.mockReturnValue({ provider: { kind: "integration" } })
})

describe("connectTargets — ConnectSession.encryptedAuth tamper detection (real encryption)", () => {
  it("scopes a missing target session lookup to the request workspace", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)

    await expect(
      connectTargets({
        sessionId: "session-from-another-workspace",
        workspaceId: "ws-2",
        targetIds: ["page-1"],
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "session-from-another-workspace",
      workspaceId: "ws-2",
    })
  })

  it("reports an in-progress target without releasing its live claim", async () => {
    const encryptedAuth = await encryptUtils.encryptObject(
      [
        {
          sourceId: "page-1",
          displayName: "Page One",
          auth: { authType: "none" },
        },
      ],
      `connect-session:${baseSession.id}`,
    )
    mocks.findByIdForWorkspace.mockResolvedValue({
      ...baseSession,
      encryptedAuth,
    })
    mocks.claimTarget.mockResolvedValue(false)
    mocks.recordResults.mockResolvedValue({
      ...baseSession,
      status: "awaiting_selection",
    })

    const result = await connectTargets({
      sessionId: baseSession.id,
      workspaceId: baseSession.workspaceId,
      targetIds: ["page-1"],
    })

    expect(mocks.releaseTarget).not.toHaveBeenCalled()
    expect(mocks.recordResults).toHaveBeenCalledWith({
      id: baseSession.id,
      workspaceId: baseSession.workspaceId,
      results: [],
      resultConnectionIds: [],
    })
    expect(result.outcomes).toEqual([
      { targetId: "page-1", status: "failed", reason: "inProgress" },
    ])
  })

  it("rejects a tampered encryptedAuth ciphertext instead of silently decrypting garbage (regression: replaces the deleted facebook-pending-auth tamper test)", async () => {
    const encryptedAuth = await encryptUtils.encryptObject(
      [
        {
          sourceId: "page-1",
          displayName: "Page One",
          auth: { authType: "none" },
        },
      ],
      `connect-session:${baseSession.id}`,
    )
    // Flip the hex ciphertext's last character — the AES-GCM auth tag no
    // longer matches, so decryption itself fails.
    const flipHexChar = (hex: string) =>
      hex.endsWith("a") ? `${hex.slice(0, -1)}b` : `${hex.slice(0, -1)}a`
    const tampered = {
      ...encryptedAuth,
      text: flipHexChar(encryptedAuth.text),
    }
    mocks.findByIdForWorkspace.mockResolvedValue({
      ...baseSession,
      encryptedAuth: tampered,
    })

    await expect(
      connectTargets({
        sessionId: baseSession.id,
        workspaceId: baseSession.workspaceId,
        targetIds: ["page-1"],
      }),
    ).rejects.toThrow()

    expect(mocks.claimTarget).not.toHaveBeenCalled()
    expect(mocks.recordResults).not.toHaveBeenCalled()
  })

  it("rejects an encryptedAuth blob encrypted under a DIFFERENT session's AAD — a session cannot be fed another session's ciphertext", async () => {
    const encryptedAuth = await encryptUtils.encryptObject(
      [
        {
          sourceId: "page-1",
          displayName: "Page One",
          auth: { authType: "none" },
        },
      ],
      "connect-session:some-other-session",
    )
    mocks.findByIdForWorkspace.mockResolvedValue({
      ...baseSession,
      encryptedAuth,
    })

    await expect(
      connectTargets({
        sessionId: baseSession.id,
        workspaceId: baseSession.workspaceId,
        targetIds: ["page-1"],
      }),
    ).rejects.toThrow()
  })
})
