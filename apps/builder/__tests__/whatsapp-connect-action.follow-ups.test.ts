// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  type ActionHandler,
  BASE_INPUT,
  defaultSession,
  integrationRow,
  mocks,
  resetWhatsappConnectActionMocks,
  selectedPhoneNumber,
} from "./whatsapp-connect-action.mocks"

// ---------------------------------------------------------------------------
// `connectWhatsappAction`'s best-effort follow-ups (WABA pre-work, coexist
// eligibility, connected-outcome `extra`) and its outer-catch mapping for
// unhandled failures during persist. The action never throws — every failure
// comes back as a typed `{ kind: "outcome" | "sessionError" }` result via the
// shared `toConnectActionFailure` (unmocked, exercised for real here).
//
// The session path lives in `whatsapp-connect-action.session.test.ts`; the
// direct (non-session) paths, the selection request, and manual-connect id
// resolution live in `whatsapp-connect-action.direct.test.ts`. All three
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

describe("connectWhatsappAction — follow-ups and unhandled failures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWhatsappConnectActionMocks()
  })

  describe("WABA pre-work", () => {
    test("runs before persist and is idempotent across two requests", async () => {
      const secondPhoneNumber = { ...selectedPhoneNumber, id: "phone-2" }
      mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
        ...defaultSession,
        candidatePhoneNumberIds: [selectedPhoneNumber.id, secondPhoneNumber.id],
      })
      mocks.listPhoneNumbersMock.mockResolvedValue({
        data: [selectedPhoneNumber, secondPhoneNumber],
        paging: { cursors: { before: "", after: "" } },
      })

      const order: string[] = []
      mocks.addSystemUserMock.mockImplementation(() => {
        order.push("addSystemUser")
        return Promise.resolve()
      })
      mocks.subscribeWebhookMock.mockImplementation(() => {
        order.push("subscribeWebhook")
        return Promise.resolve()
      })
      mocks.connectPhoneNumberMock.mockImplementation(() => {
        order.push("connectPhoneNumber")
        return Promise.resolve({
          workspaceId: "ws-1",
          createdWorkspace: false,
          integrationRow,
          wasCreated: true,
        })
      })

      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          phoneNumberId: selectedPhoneNumber.id,
          signupSessionId: "signup-session-1",
        },
      })

      expect(order).toEqual([
        "addSystemUser",
        "subscribeWebhook",
        "connectPhoneNumber",
      ])

      mocks.addSystemUserMock.mockClear()
      mocks.subscribeWebhookMock.mockClear()

      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          phoneNumberId: "phone-2",
          signupSessionId: "signup-session-1",
        },
      })

      // Same request shape runs the same idempotent calls again — no
      // state carried between requests that would skip them.
      expect(mocks.addSystemUserMock).toHaveBeenCalledTimes(1)
      // Plain subscribeWebhook now also runs once from the manual follow-up
      // path on OTHER requests, but this is the non-manual pre-work call —
      // exactly one per request here too.
      expect(mocks.subscribeWebhookMock).toHaveBeenCalledTimes(1)
    })

    test("manual connect never runs WABA-level pre-work", async () => {
      mocks.listPhoneNumbersMock.mockResolvedValue({
        data: [selectedPhoneNumber],
        paging: { cursors: { before: "", after: "" } },
      })

      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          manualConnect: true,
          wabaId: "waba-1",
          accessToken: "manual-token",
          manualPhoneNumberId: selectedPhoneNumber.id,
        },
      })

      expect(mocks.addSystemUserMock).not.toHaveBeenCalled()
    })

    test("manual connect: the plain subscribe runs, then the override subscribe, in that order", async () => {
      mocks.listPhoneNumbersMock.mockResolvedValue({
        data: [selectedPhoneNumber],
        paging: { cursors: { before: "", after: "" } },
      })

      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          manualConnect: true,
          wabaId: "waba-1",
          accessToken: "manual-token",
          manualPhoneNumberId: selectedPhoneNumber.id,
        },
      })

      expect(mocks.subscribeWebhookMock).toHaveBeenCalledTimes(2)
      const [firstCall, secondCall] = mocks.subscribeWebhookMock.mock.calls
      expect(firstCall?.[0]).not.toMatchObject({ overrideCallbackUrl: true })
      expect(secondCall?.[0]).toMatchObject({ overrideCallbackUrl: true })
      expect(mocks.updateAuthMock).toHaveBeenCalled()
    })
  })

  describe("coexist eligibility", () => {
    test("does not register the number and marks the outcome coexist-eligible", async () => {
      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          phoneNumberId: selectedPhoneNumber.id,
          signupSessionId: "signup-session-1",
        },
      })

      expect(mocks.getCoexistEligibilityMock).toHaveBeenCalledWith({
        phoneNumberId: selectedPhoneNumber.id,
        accessToken: "access-token-1",
        version: "v23.0",
      })
      expect(mocks.registerPhoneNumberMock).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        type: "connected",
        outcome: { coexistEligible: true },
      })
    })

    test("registers the number when not coexist-eligible", async () => {
      mocks.getCoexistEligibilityMock.mockResolvedValue({
        isOnBizApp: false,
        platformType: "CLOUD_API",
      })

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          phoneNumberId: selectedPhoneNumber.id,
          signupSessionId: "signup-session-1",
        },
      })

      expect(mocks.registerPhoneNumberMock).toHaveBeenCalledWith({
        auth: expect.anything(),
        phoneNumberId: selectedPhoneNumber.id,
      })
      expect(result).toMatchObject({
        type: "connected",
        outcome: { coexistEligible: false },
      })
    })
  })

  describe("connected outcome extras", () => {
    test("a registration throw still returns connected, with a followUpFailed warning and extra: null", async () => {
      mocks.getCoexistEligibilityMock.mockResolvedValue({
        isOnBizApp: false,
        platformType: "CLOUD_API",
      })
      mocks.registerPhoneNumberMock.mockRejectedValueOnce(new Error("boom"))

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          phoneNumberId: selectedPhoneNumber.id,
          signupSessionId: "signup-session-1",
        },
      })

      expect(result).toMatchObject({
        type: "connected",
        outcome: {
          status: "connected",
          warning: "followUpFailed",
          extra: null,
        },
      })
    })

    test("a CAPI-cache throw still returns connected, with a followUpFailed warning and extra: null", async () => {
      mocks.refreshCapiScopeCacheMock.mockRejectedValueOnce(
        new Error("capi boom"),
      )

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          phoneNumberId: selectedPhoneNumber.id,
          signupSessionId: "signup-session-1",
        },
      })

      expect(result).toMatchObject({
        type: "connected",
        outcome: { warning: "followUpFailed", extra: null },
      })
    })

    test("a manual-webhook throw still returns connected, with a followUpFailed warning and extra: null", async () => {
      mocks.listPhoneNumbersMock.mockResolvedValue({
        data: [selectedPhoneNumber],
        paging: { cursors: { before: "", after: "" } },
      })
      mocks.getCoexistEligibilityMock.mockResolvedValue({
        isOnBizApp: false,
        platformType: "CLOUD_API",
      })
      // The plain subscribe (first call) succeeds; the override (second,
      // inside subscribeManualWebhook) fails and must not be swallowed.
      mocks.subscribeWebhookMock
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("webhook boom"))

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          manualConnect: true,
          wabaId: "waba-1",
          accessToken: "manual-token",
          manualPhoneNumberId: selectedPhoneNumber.id,
        },
      })

      expect(result).toMatchObject({
        type: "connected",
        isManual: true,
        outcome: { warning: "followUpFailed", extra: null },
      })
      expect(mocks.updateAuthMock).not.toHaveBeenCalled()
    })

    test("manual connect needing OTP carries both requiresPhoneVerification and the manual result in extra", async () => {
      mocks.listPhoneNumbersMock.mockResolvedValue({
        data: [selectedPhoneNumber],
        paging: { cursors: { before: "", after: "" } },
      })
      mocks.getCoexistEligibilityMock.mockResolvedValue({
        isOnBizApp: false,
        platformType: "CLOUD_API",
      })
      const registrationError = {
        code: 100,
        subCode: 2_593_005,
        message: "Invalid parameter",
        at: "2026-07-27T08:00:00.000Z",
      }
      mocks.registerPhoneNumberMock.mockResolvedValueOnce({
        status: "verification_required",
        error: new Error("Phone number is not verified"),
      })
      mocks.recordRegistrationOutcomeMock.mockResolvedValueOnce(
        registrationError,
      )

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          manualConnect: true,
          wabaId: "waba-1",
          accessToken: "manual-token",
          manualPhoneNumberId: selectedPhoneNumber.id,
        },
      })

      expect(result).toMatchObject({
        type: "connected",
        isManual: true,
        outcome: {
          warning: undefined,
          extra: {
            requiresPhoneVerification: true,
            registrationError,
            manual: {
              integrationId: integrationRow.id,
              workspaceId: "ws-1",
            },
          },
        },
      })
    })
  })

  describe("unhandled failures", () => {
    test("an unexpected error during persist is logged and returned as an unknown item failure", async () => {
      mocks.connectPhoneNumberMock.mockRejectedValueOnce(
        new Error("db exploded"),
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
          status: "failed",
          reason: "unknown",
          coexistEligible: false,
        },
      })
      expect(mocks.loggerErrorMock).toHaveBeenCalled()
    })

    test("a real quota-style exception during persist still maps through the shared outcome vocabulary", async () => {
      const quotaError = new ChatbotXException(
        "Channel limit reached for this plan",
        "channelLimitReached",
      )
      mocks.connectPhoneNumberMock.mockRejectedValueOnce(quotaError)

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
          status: "limitReached",
          reason: "channelLimit",
          coexistEligible: false,
        },
      })
    })
  })
})
