// @vitest-environment node

import {
  ChatbotXException,
  channelDuplicatedException,
  connectSessionExpiredException,
} from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  type ActionHandler,
  BASE_INPUT,
  defaultSession,
  mocks,
  resetWhatsappConnectActionMocks,
  selectedPhoneNumber,
} from "./whatsapp-connect-action.mocks"

// ---------------------------------------------------------------------------
// `connectWhatsappAction` follows the shared per-account connect skeleton
// (plan §2.4/§3.4): one number per request. The session path never receives a
// `workspaceId`/`code`/`accessToken`/`wabaId` from the client at all (schema-
// enforced): the session row is the only source, and its `ownerId` is
// re-verified against `resolvePlatformOwnerId({userId, workspaceId:
// session.workspaceId})` — a mismatch (forged/foreign session) reads as
// `sessionExpired`, same as an expired/missing one.
//
// This file covers the SESSION path only. The direct (non-session) paths and
// the selection request live in `whatsapp-connect-action.direct.test.ts`;
// WABA pre-work, coexist eligibility, connected-outcome extras, and unhandled
// failures live in `whatsapp-connect-action.follow-ups.test.ts`. All three
// share fixtures/mocks from `whatsapp-connect-action.mocks.ts`.
// ---------------------------------------------------------------------------

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.inputSchema = () => chain
  chain.action = (handler: ActionHandler) => handler
  return { authActionClient: chain }
})

vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: mocks.resolvePlatformOwnerIdMock,
}))

vi.mock("@/lib/provider-origin", () => ({
  resolveProviderOriginForCredential: mocks.resolveProviderOriginMock,
}))

vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess: mocks.checkWorkspaceOwnerAccessMock,
  workspaceAccessDenialException: (reason: string) =>
    new ChatbotXException(reason, reason, 403),
}))

vi.mock("@/features/workspaces/actions/upload-logo", () => ({
  updateWorkspaceLogo: mocks.updateWorkspaceLogoMock,
}))

vi.mock("@/lib/log", () => ({
  logger: {
    error: mocks.loggerErrorMock,
    info: vi.fn(),
    warn: mocks.loggerWarnMock,
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContextMock,
  integrationWhatsappService: {
    connectPhoneNumber: mocks.connectPhoneNumberMock,
    createSignupSession: mocks.createSignupSessionMock,
    findActiveSignupSessionForUser: mocks.findActiveSignupSessionForUserMock,
    findConnectedPhoneNumberIds: mocks.findConnectedPhoneNumberIdsMock,
    recordRegistrationOutcome: mocks.recordRegistrationOutcomeMock,
    refreshCapiScopeCache: mocks.refreshCapiScopeCacheMock,
    updateAuth: mocks.updateAuthMock,
  },
  platformCredentialService: {
    resolveForOwner: mocks.platformCredentialResolveMock,
  },
  whatsappBusinessAccountService: {
    findByWaba: mocks.findWabaRecordMock,
    markProvisioned: mocks.markWabaProvisionedMock,
    upsertCurrentCredential: mocks.upsertWabaCredentialMock,
  },
  workspaceMemberService: {
    isMember: mocks.isMemberMock,
  },
  workspaceService: {
    find: mocks.workspaceFindMock,
  },
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  addSystemUser: mocks.addSystemUserMock,
  integration: { name: "whatsapp" },
  registerPhoneNumber: mocks.registerPhoneNumberMock,
  shareCreditLine: mocks.shareCreditLineMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/auth", () => ({
  appAccessToken: (settings: { clientId: string; clientSecret: string }) =>
    `${settings.clientId}|${settings.clientSecret}`,
  debugToken: mocks.debugTokenMock,
  // `getWhatsappGrantedScopes` reads the grant through this one, and
  // `persistConnectedWaba` swallows its own failures — leaving it off the mock
  // silently skipped the WABA record write instead of failing the test.
  debugTokenOrThrow: mocks.debugTokenMock,
  exchangeAccessToken: mocks.exchangeAccessTokenMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/waba-owner", () => ({
  resolveOwningWabaId: mocks.resolveOwningWabaIdMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/waba-candidates", () => ({
  resolveBusinessAppCandidates: mocks.resolveBusinessAppCandidatesMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/phone-number", () => ({
  getCoexistEligibility: mocks.getCoexistEligibilityMock,
  listPhoneNumbers: mocks.listPhoneNumbersMock,
  normalizeWhatsappDisplayPhoneNumber: (phone: string) =>
    phone.replace(/\D/g, ""),
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/waba", () => ({
  findWaba: mocks.findWabaMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/webhook", () => ({
  subscribeWebhook: mocks.subscribeWebhookMock,
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.distributedLockRunExclusiveMock },
  invalidateCacheByTags: mocks.invalidateCacheByTagsMock,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: mocks.createIdMock }
})

const { connectWhatsappAction } = await import(
  "@/features/integration-whatsapp/actions/connect.action"
)

const callConnectWhatsappAction =
  connectWhatsappAction as unknown as ActionHandler

describe("connectWhatsappAction — session path", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWhatsappConnectActionMocks()
  })

  test("reads token/WABA/business/workspace from the session row", async () => {
    mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
      ...defaultSession,
      workspaceId: "ws-from-session",
      accessToken: "session-token",
      apiVersion: "v20.0",
      businessId: "session-business",
      wabaId: "session-waba",
    })

    await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(mocks.listPhoneNumbersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        wabaId: "session-waba",
        accessToken: "session-token",
        version: "v20.0",
      }),
    )
    expect(mocks.connectPhoneNumberMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-from-session",
        wabaId: "session-waba",
        businessId: "session-business",
      }),
    )
  })

  test("session expired/foreign id returns typed sessionExpired, never thrown", async () => {
    mocks.findActiveSignupSessionForUserMock.mockResolvedValueOnce(null)

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "tampered-session",
      },
    })

    expect(result).toEqual({ kind: "sessionError", code: "sessionExpired" })
    expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
  })

  test("an owner mismatch (forged/foreign session) returns sessionExpired before any credential lookup", async () => {
    mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
      ...defaultSession,
      ownerId: "owner-foreign",
    })
    // resolvePlatformOwnerId still resolves the ACTING user's real owner —
    // it never matches the foreign session's stored ownerId.
    mocks.resolvePlatformOwnerIdMock.mockResolvedValue("owner-1")

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(result).toEqual({ kind: "sessionError", code: "sessionExpired" })
    expect(mocks.platformCredentialResolveMock).not.toHaveBeenCalled()
    expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
  })

  test("a matching owner (host-derived, same as the session's) proceeds normally", async () => {
    mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
      ...defaultSession,
      ownerId: "owner-1",
    })
    mocks.resolvePlatformOwnerIdMock.mockResolvedValue("owner-1")

    await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(mocks.platformCredentialResolveMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner-1" }),
    )
    expect(mocks.connectPhoneNumberMock).toHaveBeenCalled()
  })

  test("a session workspace the user is not a member of returns notMember before claim/persist", async () => {
    mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
      ...defaultSession,
      workspaceId: "ws-foreign",
    })
    mocks.isMemberMock.mockResolvedValue(false)

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(result).toEqual({ kind: "sessionError", code: "notMember" })
    expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
    expect(mocks.listPhoneNumbersMock).not.toHaveBeenCalled()
  })

  test("a vanished session workspace also returns notMember", async () => {
    mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
      ...defaultSession,
      workspaceId: "ws-gone",
    })
    mocks.workspaceFindMock.mockResolvedValue(undefined)

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(result).toEqual({ kind: "sessionError", code: "notMember" })
  })

  test("a trial-expired session workspace owner returns trialExpired", async () => {
    mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
      ...defaultSession,
      workspaceId: "ws-1",
    })
    mocks.checkWorkspaceOwnerAccessMock.mockResolvedValue("trialExpired")

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(result).toEqual({ kind: "sessionError", code: "trialExpired" })
    expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
  })

  test("a MAC-limited session workspace owner returns macLimitReached", async () => {
    mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
      ...defaultSession,
      workspaceId: "ws-1",
    })
    mocks.checkWorkspaceOwnerAccessMock.mockResolvedValue("macLimitReached")

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(result).toEqual({ kind: "sessionError", code: "macLimitReached" })
  })

  test("a null session workspace skips the membership guard and passes null through to connectPhoneNumber", async () => {
    await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(mocks.isMemberMock).not.toHaveBeenCalled()
    expect(mocks.connectPhoneNumberMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: null }),
    )
  })

  test("a second request reuses the workspace the first request's transaction bound", async () => {
    mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
      ...defaultSession,
      workspaceId: "ws-bound",
      candidatePhoneNumberIds: [selectedPhoneNumber.id, "phone-2"],
    })

    await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(mocks.connectPhoneNumberMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-bound" }),
    )
  })

  test("claims the requested number inside connectPhoneNumber's transaction via the signupSession identity", async () => {
    await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(mocks.connectPhoneNumberMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signupSession: {
          id: "signup-session-1",
          userId: "user-1",
          ownerId: "owner-1",
        },
      }),
    )
  })

  test("a non-candidate phone number id resolves to notSelectable without a Meta list call", async () => {
    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: "not-a-candidate",
        signupSessionId: "signup-session-1",
      },
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "not-a-candidate",
        name: "not-a-candidate",
        status: "failed",
        reason: "notSelectable",
        coexistEligible: false,
      },
    })
    expect(mocks.listPhoneNumbersMock).not.toHaveBeenCalled()
    expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
  })

  test("a pre-flight already-connected candidate resolves to duplicated without any Meta call", async () => {
    mocks.findConnectedPhoneNumberIdsMock.mockResolvedValue(
      new Set([selectedPhoneNumber.id]),
    )

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: selectedPhoneNumber.id,
        name: selectedPhoneNumber.id,
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
    expect(mocks.listPhoneNumbersMock).not.toHaveBeenCalled()
    expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
  })

  test("a claim rejected inside the transaction (session expired mid-flight) is returned typed, never thrown", async () => {
    mocks.connectPhoneNumberMock.mockRejectedValueOnce(
      connectSessionExpiredException(
        "Your WhatsApp signup session has expired.",
        "signupSessionExpired",
      ),
    )

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    expect(result).toEqual({ kind: "sessionError", code: "sessionExpired" })
  })

  test("retry after a lost response (the number was already claimed) resolves to duplicated", async () => {
    mocks.connectPhoneNumberMock.mockRejectedValueOnce(
      channelDuplicatedException(),
    )

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        ...BASE_INPUT,
        phoneNumberId: selectedPhoneNumber.id,
        signupSessionId: "signup-session-1",
      },
    })

    // The outer catch's identity is the raw requested id — the friendly
    // name is only known once the row is actually persisted, which this
    // request never reached.
    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: selectedPhoneNumber.id,
        name: selectedPhoneNumber.id,
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
  })
})
