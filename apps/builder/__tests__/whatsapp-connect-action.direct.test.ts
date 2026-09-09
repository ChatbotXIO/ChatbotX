// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  type ActionHandler,
  BASE_INPUT,
  EXISTING_WABA_INPUT,
  mocks,
  resetWhatsappConnectActionMocks,
  selectedPhoneNumber,
} from "./whatsapp-connect-action.mocks"

// ---------------------------------------------------------------------------
// `connectWhatsappAction` follows the shared per-account connect skeleton
// (plan §2.4/§3.4): one number per request. EVERY non-null client
// `workspaceId` on the direct (non-session) paths — manual, OAuth-with-id,
// auto-select, and the selection request that creates a session — is
// membership/quota-checked (`assertWorkspaceConnectAccess`) before any
// credential lookup or provider call.
//
// This file covers the DIRECT (non-session) paths, the selection request,
// manual-connect's id resolution, and session-level exceptions raised during
// resolution. The session path lives in
// `whatsapp-connect-action.session.test.ts`; WABA pre-work, coexist
// eligibility, connected-outcome extras, and unhandled failures live in
// `whatsapp-connect-action.follow-ups.test.ts`. All three share
// fixtures/mocks from `whatsapp-connect-action.mocks.ts`.
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

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
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

describe("connectWhatsappAction — direct paths and selection request", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWhatsappConnectActionMocks()
  })

  describe("direct paths — client workspaceId is guarded before any credential/provider work", () => {
    test("manual connect: a foreign workspaceId returns notMember with no provider call", async () => {
      mocks.isMemberMock.mockResolvedValue(false)

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          manualConnect: true,
          wabaId: "waba-1",
          accessToken: "manual-token",
          manualPhoneNumberId: selectedPhoneNumber.id,
          workspaceId: "ws-foreign",
        },
      })

      expect(result).toEqual({ kind: "sessionError", code: "notMember" })
      expect(mocks.platformCredentialResolveMock).not.toHaveBeenCalled()
      expect(mocks.addSystemUserMock).not.toHaveBeenCalled()
      expect(mocks.listPhoneNumbersMock).not.toHaveBeenCalled()
      expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
    })

    test("manual connect: a blocked owner returns trialExpired/macLimitReached with no provider call", async () => {
      mocks.checkWorkspaceOwnerAccessMock.mockResolvedValue("macLimitReached")

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          manualConnect: true,
          wabaId: "waba-1",
          accessToken: "manual-token",
          manualPhoneNumberId: selectedPhoneNumber.id,
          workspaceId: "ws-1",
        },
      })

      expect(result).toEqual({ kind: "sessionError", code: "macLimitReached" })
      expect(mocks.platformCredentialResolveMock).not.toHaveBeenCalled()
      expect(mocks.listPhoneNumbersMock).not.toHaveBeenCalled()
    })

    test("auto-select (OAuth code, no id): a foreign workspaceId returns notMember with no provider call", async () => {
      mocks.isMemberMock.mockResolvedValue(false)

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          code: "oauth-code-1",
          workspaceId: "ws-foreign",
        },
      })

      expect(result).toEqual({ kind: "sessionError", code: "notMember" })
      expect(mocks.platformCredentialResolveMock).not.toHaveBeenCalled()
      expect(mocks.exchangeAccessTokenMock).not.toHaveBeenCalled()
      expect(mocks.resolveOwningWabaIdMock).not.toHaveBeenCalled()
    })

    test("auto-select: a blocked owner returns trialExpired with no provider call", async () => {
      mocks.checkWorkspaceOwnerAccessMock.mockResolvedValue("trialExpired")

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          code: "oauth-code-1",
          workspaceId: "ws-1",
        },
      })

      expect(result).toEqual({ kind: "sessionError", code: "trialExpired" })
      expect(mocks.exchangeAccessTokenMock).not.toHaveBeenCalled()
    })

    test("a null workspaceId (first-ever connect) is always allowed through the guard", async () => {
      mocks.isMemberMock.mockResolvedValue(false)
      mocks.checkWorkspaceOwnerAccessMock.mockResolvedValue("trialExpired")

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          manualConnect: true,
          wabaId: "waba-1",
          accessToken: "manual-token",
          manualPhoneNumberId: selectedPhoneNumber.id,
          workspaceId: null,
        },
      })

      // isMember/checkWorkspaceOwnerAccess were rigged to fail, but the
      // guard is never invoked for a null workspaceId, so the connect
      // proceeds normally instead of being blocked.
      expect(result).toMatchObject({ type: "connected" })
    })
  })

  describe("the selection request (createPhoneNumberSelectionResult)", () => {
    test("rejects a foreign workspaceId with the same membership guard, before any provider call", async () => {
      mocks.isMemberMock.mockResolvedValue(false)

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          workspaceId: "ws-foreign",
          code: "oauth-code-1",
        },
      })

      expect(result).toEqual({ kind: "sessionError", code: "notMember" })
      expect(mocks.createSignupSessionMock).not.toHaveBeenCalled()
      expect(mocks.exchangeAccessTokenMock).not.toHaveBeenCalled()
      expect(mocks.platformCredentialResolveMock).not.toHaveBeenCalled()
    })

    test("creates the session and returns the candidate list when the WABA has multiple phones", async () => {
      const connectedPhoneNumber = {
        ...selectedPhoneNumber,
        id: "phone-connected",
        verified_name: "Connected Phone",
        display_phone_number: "+84 90 000 0000",
      }
      mocks.listPhoneNumbersMock.mockResolvedValue({
        data: [selectedPhoneNumber, connectedPhoneNumber],
        paging: { cursors: { before: "", after: "" } },
      })
      mocks.findConnectedPhoneNumberIdsMock.mockResolvedValue(
        new Set([connectedPhoneNumber.id]),
      )

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...EXISTING_WABA_INPUT, code: "oauth-code-1" },
      })

      expect(result).toEqual({
        type: "phoneNumberSelection",
        signupSessionId: "signup-session-next",
        phoneNumbers: [
          {
            id: selectedPhoneNumber.id,
            label: selectedPhoneNumber.verified_name,
            displayPhoneNumber: selectedPhoneNumber.display_phone_number,
          },
        ],
      })
      expect(mocks.registerPhoneNumberMock).not.toHaveBeenCalled()
    })

    test("stores the WABA the resolver picked and that WABA's numbers", async () => {
      const owningPhoneNumber = { ...selectedPhoneNumber, id: "phone-owned" }
      mocks.resolveOwningWabaIdMock.mockResolvedValue("waba-owning")
      mocks.findWabaMock.mockResolvedValue({
        id: "waba-owning",
        owner_business_info: { id: "business-2" },
      })
      mocks.listPhoneNumbersMock.mockResolvedValue({
        data: [selectedPhoneNumber, owningPhoneNumber],
        paging: { cursors: { before: "", after: "" } },
      })

      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...EXISTING_WABA_INPUT, code: "oauth-code-1" },
      })

      expect(mocks.listPhoneNumbersMock).toHaveBeenCalledWith(
        expect.objectContaining({ wabaId: "waba-owning" }),
      )
      expect(mocks.createSignupSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          wabaId: "waba-owning",
          businessId: "business-2",
          candidatePhoneNumberIds: [
            selectedPhoneNumber.id,
            owningPhoneNumber.id,
          ],
        }),
      )
    })

    test("hints the resolver with the requested phone number id", async () => {
      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          code: "oauth-code-1",
          phoneNumberId: selectedPhoneNumber.id,
        },
      })

      expect(mocks.resolveOwningWabaIdMock).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumberIds: [selectedPhoneNumber.id],
          systemUserToken: "system-token-1",
          systemUserId: "system-user-1",
        }),
      )
    })

    test("fails the connect when no granted target owns the numbers", async () => {
      mocks.resolveOwningWabaIdMock.mockResolvedValue(null)

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...EXISTING_WABA_INPUT, code: "oauth-code-1" },
      })

      expect(result).toMatchObject({
        kind: "outcome",
        outcome: {
          status: "failed",
          reason: "notSelectable",
          detail: "whatsapp.connect.errors.wabaResolveFailed",
        },
      })
      expect(mocks.createSignupSessionMock).not.toHaveBeenCalled()
      expect(mocks.listPhoneNumbersMock).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // "Connect a WhatsApp Business App" (coexistence). An Embedded Signup token
  // carries every WABA the user ever granted, cumulatively, and each
  // coexistence onboarding mints a NEW WABA for the one number it onboarded —
  // so scoring WABAs by how many numbers they hold lands on the operator's
  // biggest Cloud API account instead. This mode asks the other question:
  // which numbers, across every granted WABA, are on the WhatsApp Business
  // app? Among those, the one onboarded THIS login is always first in Meta's
  // target order, and Meta only allows the history sync once within 24h of
  // onboarding — so the rest are never offered.
  // -------------------------------------------------------------------------
  describe("coexistence mode (Connect a WhatsApp Business App)", () => {
    const businessAppCandidate = (
      phoneNumberId: string,
      wabaId: string,
      businessId: string,
    ) => ({
      wabaId,
      businessId,
      phoneNumber: {
        ...selectedPhoneNumber,
        id: phoneNumberId,
        is_on_biz_app: true,
      },
    })

    test("connects the single Business App candidate through its OWN WABA, without resolving an owning WABA", async () => {
      mocks.resolveBusinessAppCandidatesMock.mockResolvedValue([
        businessAppCandidate(
          selectedPhoneNumber.id,
          "waba-titan",
          "business-titan",
        ),
      ])

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...BASE_INPUT, code: "oauth-code-1" },
      })

      expect(result).toMatchObject({ type: "connected" })
      expect(mocks.connectPhoneNumberMock).toHaveBeenCalledWith(
        expect.objectContaining({
          wabaId: "waba-titan",
          businessId: "business-titan",
        }),
      )
      expect(mocks.resolveOwningWabaIdMock).not.toHaveBeenCalled()
      expect(mocks.createSignupSessionMock).not.toHaveBeenCalled()
    })

    test("takes the FIRST candidate in Meta order and never opens a picker", async () => {
      mocks.resolveBusinessAppCandidatesMock.mockResolvedValue([
        businessAppCandidate("phone-newest", "waba-titan", "business-titan"),
        businessAppCandidate("phone-older", "waba-shop", "business-shop"),
        businessAppCandidate("phone-oldest", "waba-banana", "business-banana"),
      ])

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...BASE_INPUT, code: "oauth-code-1" },
      })

      expect(result).toMatchObject({ type: "connected" })
      expect(mocks.connectPhoneNumberMock).toHaveBeenCalledTimes(1)
      expect(mocks.connectPhoneNumberMock).toHaveBeenCalledWith(
        expect.objectContaining({
          wabaId: "waba-titan",
          businessId: "business-titan",
          phoneNumber: expect.objectContaining({ id: "phone-newest" }),
        }),
      )
      expect(mocks.resolveOwningWabaIdMock).not.toHaveBeenCalled()
      expect(mocks.createSignupSessionMock).not.toHaveBeenCalled()
    })

    test("the form's empty businessId never overrides the candidate WABA's own", async () => {
      mocks.resolveBusinessAppCandidatesMock.mockResolvedValue([
        businessAppCandidate(
          selectedPhoneNumber.id,
          "waba-titan",
          "business-titan",
        ),
      ])

      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...BASE_INPUT, businessId: "", code: "oauth-code-1" },
      })

      expect(mocks.connectPhoneNumberMock).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: "business-titan" }),
      )
    })

    test("skips the already-connected candidates and takes the first one still free", async () => {
      mocks.resolveBusinessAppCandidatesMock.mockResolvedValue([
        businessAppCandidate("phone-taken", "waba-taken", "business-taken"),
        businessAppCandidate("phone-free", "waba-free", "business-free"),
      ])
      mocks.findConnectedPhoneNumberIdsMock.mockResolvedValue(
        new Set(["phone-taken"]),
      )

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...BASE_INPUT, code: "oauth-code-1" },
      })

      expect(result).toMatchObject({ type: "connected" })
      expect(mocks.connectPhoneNumberMock).toHaveBeenCalledWith(
        expect.objectContaining({
          wabaId: "waba-free",
          phoneNumber: expect.objectContaining({ id: "phone-free" }),
        }),
      )
    })

    test("no Business App number at all short-circuits to noPhoneNumberCandidates", async () => {
      mocks.resolveBusinessAppCandidatesMock.mockResolvedValue([])

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...BASE_INPUT, code: "oauth-code-1" },
      })

      expect(result).toEqual({ type: "noPhoneNumberCandidates" })
      expect(mocks.createSignupSessionMock).not.toHaveBeenCalled()
      expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
    })

    test("every Business App number already connected short-circuits to phoneNumbersAlreadyConnected", async () => {
      mocks.findConnectedPhoneNumberIdsMock.mockResolvedValue(
        new Set([selectedPhoneNumber.id]),
      )

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...BASE_INPUT, code: "oauth-code-1" },
      })

      expect(result).toEqual({ type: "phoneNumbersAlreadyConnected" })
      expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
    })

    test("a request that already names a phone number keeps the owning-WABA path", async () => {
      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          code: "oauth-code-1",
          phoneNumberId: selectedPhoneNumber.id,
        },
      })

      expect(mocks.resolveOwningWabaIdMock).toHaveBeenCalled()
      expect(mocks.resolveBusinessAppCandidatesMock).not.toHaveBeenCalled()
    })

    test("the existing-WABA mode is untouched: it still resolves one owning WABA", async () => {
      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...EXISTING_WABA_INPUT, code: "oauth-code-1" },
      })

      expect(mocks.resolveOwningWabaIdMock).toHaveBeenCalled()
      expect(mocks.resolveBusinessAppCandidatesMock).not.toHaveBeenCalled()
    })

    test("a transfer (only_waba_sharing) is not a coexistence signup either", async () => {
      await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          transferPhoneNumber: true,
          code: "oauth-code-1",
        },
      })

      expect(mocks.resolveOwningWabaIdMock).toHaveBeenCalled()
      expect(mocks.resolveBusinessAppCandidatesMock).not.toHaveBeenCalled()
    })
  })

  describe("manual connect", () => {
    test("a manual id unknown to the WABA's phone list resolves to notSelectable", async () => {
      mocks.listPhoneNumbersMock.mockResolvedValue({
        data: [selectedPhoneNumber],
        paging: { cursors: { before: "", after: "" } },
      })

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          ...BASE_INPUT,
          manualConnect: true,
          wabaId: "waba-1",
          accessToken: "manual-token",
          manualPhoneNumberId: "unknown-id",
        },
      })

      expect(result).toEqual({
        kind: "outcome",
        outcome: {
          sourceId: "unknown-id",
          name: "unknown-id",
          status: "failed",
          reason: "notSelectable",
          coexistEligible: false,
        },
      })
      expect(mocks.connectPhoneNumberMock).not.toHaveBeenCalled()
    })
  })

  describe("session-level exceptions from resolution", () => {
    test("missing WhatsApp credential returns credentialMissing", async () => {
      mocks.platformCredentialResolveMock.mockResolvedValue(null)

      const result = await callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: { ...BASE_INPUT, code: "oauth-code-1" },
      })

      expect(result).toEqual({
        kind: "sessionError",
        code: "credentialMissing",
      })
    })
  })
})
