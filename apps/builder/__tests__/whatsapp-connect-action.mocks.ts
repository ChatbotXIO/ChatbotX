// @vitest-environment node

import { vi } from "vitest"

// ---------------------------------------------------------------------------
// Shared mock functions, fixtures, and reset helper for
// `whatsapp-connect-action.session.test.ts` /
// `.direct.test.ts` / `.follow-ups.test.ts` — the three files this suite was
// split into (see `whatsapp-connect-action-registration.test.ts`'s original
// history for the full context comment on `connectWhatsappAction`'s shared
// per-account connect skeleton).
//
// Each spec file still registers its own `vi.mock(...)` calls (mocking is
// file-scoped in Vitest — a mock registered here would not apply to an
// importing file), but they all reference the SAME `mocks` object exported
// below, and all reset it identically via `resetWhatsappConnectActionMocks`.
// Referencing an imported identifier inside a `vi.mock` factory is fine —
// Vitest's hoisting restriction only applies to a factory referencing a
// LOCAL top-level variable declared in the same file.
// ---------------------------------------------------------------------------

export type ActionHandler = (args: {
  ctx: { user: { id: string } }
  parsedInput: {
    businessId?: string | null
    wabaId?: string | null
    connectExisting: boolean
    transferPhoneNumber: boolean
    manualConnect: boolean
    marketingMessageLite: boolean
    phoneNumberId?: string | null
    manualPhoneNumberId?: string | null
    workspaceId?: string | null
    signupSessionId?: string | null
    accessToken?: string | null
    code?: string | null
  }
}) => Promise<unknown>

export const mocks = {
  addSystemUserMock: vi.fn(),
  buildContextMock: vi.fn(),
  checkWorkspaceOwnerAccessMock: vi.fn(),
  connectPhoneNumberMock: vi.fn(),
  createSignupSessionMock: vi.fn(),
  findActiveSignupSessionForUserMock: vi.fn(),
  createIdMock: vi.fn(),
  debugTokenMock: vi.fn(),
  distributedLockRunExclusiveMock: vi.fn(),
  exchangeAccessTokenMock: vi.fn(),
  findConnectedPhoneNumberIdsMock: vi.fn(),
  findWabaMock: vi.fn(),
  getCoexistEligibilityMock: vi.fn(),
  resolveOwningWabaIdMock: vi.fn(),
  resolveBusinessAppCandidatesMock: vi.fn(),
  invalidateCacheByTagsMock: vi.fn(),
  isMemberMock: vi.fn(),
  listPhoneNumbersMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  platformCredentialResolveMock: vi.fn(),
  recordRegistrationOutcomeMock: vi.fn(),
  refreshCapiScopeCacheMock: vi.fn(),
  registerPhoneNumberMock: vi.fn(),
  resolvePlatformOwnerIdMock: vi.fn(),
  resolveProviderOriginMock: vi.fn(),
  shareCreditLineMock: vi.fn(),
  subscribeWebhookMock: vi.fn(),
  findWabaRecordMock: vi.fn(),
  markWabaProvisionedMock: vi.fn(),
  upsertWabaCredentialMock: vi.fn(),
  updateAuthMock: vi.fn(),
  updateWorkspaceLogoMock: vi.fn(),
  workspaceFindMock: vi.fn(),
}

export const selectedPhoneNumber = {
  id: "phone-1",
  verified_name: "Verified Phone",
  code_verification_status: "VERIFIED",
  display_phone_number: "+84 34 872 1855",
  quality_rating: "GREEN",
  platform_type: "CLOUD_API",
  throughput: { level: "STANDARD" },
  webhook_configuration: {},
}

export const connectedPhoneNumber = {
  ...selectedPhoneNumber,
  id: "phone-connected",
  verified_name: "Connected Phone",
  display_phone_number: "+84 90 000 0000",
}

export const integrationRow = {
  id: "integration-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  auth: {},
  phoneNumberId: selectedPhoneNumber.id,
  wabaId: "waba-1",
  businessId: "business-1",
  name: selectedPhoneNumber.verified_name,
  displayPhoneNumber: "84348721855",
  isCoexist: true,
  platformType: "CLOUD_API",
}

export const BASE_INPUT = {
  businessId: null,
  wabaId: null,
  connectExisting: true,
  transferPhoneNumber: false,
  manualConnect: false,
  marketingMessageLite: true,
  phoneNumberId: null,
  manualPhoneNumberId: null,
  workspaceId: null,
  signupSessionId: null,
  accessToken: null,
  code: null,
}

export const defaultSession = {
  id: "signup-session-1",
  userId: "user-1",
  ownerId: "owner-1",
  workspaceId: null as string | null,
  accessToken: "access-token-1",
  apiVersion: "v23.0",
  businessId: "business-1",
  wabaId: "waba-1",
  candidatePhoneNumberIds: [selectedPhoneNumber.id],
}

/**
 * The "Connect an existing WhatsApp Business Account" mode: `connectExisting`
 * off means the signup asked Meta for plain WABA sharing, so the connect keeps
 * the `resolveOwningWabaId` path instead of the coexistence one.
 */
export const EXISTING_WABA_INPUT = {
  ...BASE_INPUT,
  connectExisting: false,
}

/** Mirrors the original suite's shared `beforeEach` — call after `vi.clearAllMocks()`. */
export function resetWhatsappConnectActionMocks() {
  mocks.createIdMock.mockReturnValue("integration-1")

  mocks.resolvePlatformOwnerIdMock.mockResolvedValue("owner-1")
  mocks.resolveProviderOriginMock.mockResolvedValue(
    "https://broker.example.com",
  )
  mocks.checkWorkspaceOwnerAccessMock.mockResolvedValue(null)
  mocks.isMemberMock.mockResolvedValue(true)
  mocks.workspaceFindMock.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })

  mocks.platformCredentialResolveMock.mockResolvedValue({
    config: {
      clientId: "client-1",
      clientSecret: "secret-1",
      configId: "config-1",
      systemUserId: "system-user-1",
      systemUserToken: "system-token-1",
      businessName: "Business",
      verifyToken: "verify-token",
      version: "v23.0",
      businessId: "",
    },
  })

  mocks.findActiveSignupSessionForUserMock.mockResolvedValue({
    ...defaultSession,
  })
  mocks.createSignupSessionMock.mockResolvedValue({ id: "signup-session-next" })

  mocks.exchangeAccessTokenMock.mockResolvedValue({
    access_token: "access-token-1",
  })
  mocks.resolveOwningWabaIdMock.mockResolvedValue("waba-1")
  // The coexistence path's own resolver. Default: the login onboarded exactly
  // one Business App number, on its own freshly-minted WABA.
  mocks.resolveBusinessAppCandidatesMock.mockResolvedValue([
    {
      wabaId: "waba-biz-app",
      businessId: "business-biz-app",
      phoneNumber: { ...selectedPhoneNumber, is_on_biz_app: true },
    },
  ])
  mocks.findWabaMock.mockResolvedValue({
    id: "waba-1",
    owner_business_info: { id: "business-1" },
  })
  mocks.listPhoneNumbersMock.mockResolvedValue({
    data: [selectedPhoneNumber],
    paging: { cursors: { before: "", after: "" } },
  })
  mocks.findConnectedPhoneNumberIdsMock.mockResolvedValue(new Set<string>())
  mocks.getCoexistEligibilityMock.mockResolvedValue({
    isOnBizApp: true,
    platformType: "CLOUD_API",
  })
  mocks.registerPhoneNumberMock.mockResolvedValue({ status: "registered" })
  mocks.recordRegistrationOutcomeMock.mockResolvedValue(null)
  mocks.refreshCapiScopeCacheMock.mockResolvedValue(null)
  mocks.addSystemUserMock.mockResolvedValue(undefined)
  mocks.shareCreditLineMock.mockResolvedValue(undefined)
  mocks.buildContextMock.mockResolvedValue({})
  mocks.updateWorkspaceLogoMock.mockResolvedValue(undefined)
  mocks.subscribeWebhookMock.mockResolvedValue(undefined)
  mocks.findWabaRecordMock.mockResolvedValue(null)
  mocks.upsertWabaCredentialMock.mockResolvedValue({
    id: "waba-row",
    revision: 1,
  })
  mocks.markWabaProvisionedMock.mockResolvedValue({
    id: "waba-row",
    revision: 2,
  })
  mocks.updateAuthMock.mockResolvedValue(undefined)
  mocks.invalidateCacheByTagsMock.mockResolvedValue(undefined)
  mocks.debugTokenMock.mockResolvedValue({ app_id: "app-123", is_valid: true })
  mocks.distributedLockRunExclusiveMock.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )

  mocks.connectPhoneNumberMock.mockResolvedValue({
    workspaceId: "ws-1",
    createdWorkspace: false,
    integrationRow,
    wasCreated: true,
  })
}
