// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const WORKSPACE_ID = "100"
const SESSION_ID = "300"
const CUSTOMER_ID = "1112223333"
const CLICK_ID = "Cj0KCQiAFULLCLICKIDxyz9"
const CONSENT_URL = "https://accounts.google.com/o/oauth2/v2/auth?state=abc"
const SETTINGS_URL = `https://app.test/space/${WORKSPACE_ID}/settings/integrations/google-ads`

const mocks = vi.hoisted(() => ({
  isSupportSession: { value: false },
  isTrialExpired: { value: false },
  assertWorkspaceSuperAdmin: vi.fn(),
  isConfigured: vi.fn(),
  getSetup: vi.fn(),
  refreshSetup: vi.fn(),
  validateIngest: vi.fn(),
  retry: vi.fn(),
  updateConsent: vi.fn(),
  startConnect: vi.fn(),
  startReconnect: vi.fn(),
  connectTargets: vi.fn(),
  disconnect: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  cancel: vi.fn(),
  cancelPendingByProvider: vi.fn(),
  completeSelection: vi.fn(),
  updateReturnUrl: vi.fn(),
  resolvePlatformOwnerId: vi.fn(),
  getOriginUrlFromHeader: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock("@/lib/auth/utils", () => ({ getCurrentUserId: vi.fn() }))
vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))
vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: vi.fn(),
  isDatabaseError: vi.fn(() => false),
}))
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_BUILDER_URL: "https://builder.test" },
}))
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {},
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  getAuditActor: vi.fn(() => undefined),
  withAuditContext: vi.fn(
    async (_ctx: unknown, fn: () => Promise<unknown>) => await fn(),
  ),
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string | undefined
    httpStatusCode: number | undefined
    constructor(message: string, code?: string, httpStatusCode?: number) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))
vi.mock("@chatbotx.io/business", () => ({
  isPlatformAdmin: vi.fn(async () => false),
  isSuperAdmin: vi.fn(() => true),
  isWorkspaceScheduledForDeletion: vi.fn(() => false),
  resolveWorkspaceAccess: vi.fn(({ realMember, workspaceId }) =>
    realMember
      ? {
          workspace: { id: workspaceId, ownerId: "owner-1" },
          member: realMember,
          isSupportSession: mocks.isSupportSession.value,
        }
      : undefined,
  ),
  integrationGoogleAdsService: {
    isConfigured: mocks.isConfigured,
    getSetup: mocks.getSetup,
    refreshSetup: mocks.refreshSetup,
    validateIngest: mocks.validateIngest,
  },
  googleAdsConversionService: { retry: mocks.retry },
  googleAdsSettingsService: { updateConsent: mocks.updateConsent },
}))
vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    cancel: mocks.cancel,
    cancelPendingByProvider: mocks.cancelPendingByProvider,
    completeSelection: mocks.completeSelection,
    updateReturnUrl: mocks.updateReturnUrl,
  },
}))
vi.mock("@chatbotx.io/connections", () => ({
  connectionService: {
    connectTargets: mocks.connectTargets,
    disconnect: mocks.disconnect,
  },
}))
vi.mock("@/features/connections/lib/connect-flow", () => ({
  startConnect: mocks.startConnect,
  startReconnect: mocks.startReconnect,
}))
vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))
vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: mocks.resolvePlatformOwnerId,
}))
vi.mock("@/lib/domain", () => ({
  getOriginUrlFromHeader: mocks.getOriginUrlFromHeader,
}))
vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  // Trial-expired owners are read/delete-only (AGENTS.md invariant 14).
  checkWorkspaceOwnerAccess: vi.fn(async () =>
    mocks.isTrialExpired.value ? "trial_expired" : null,
  ),
  workspaceAccessDenialException: vi.fn(
    (reason: string) => new Error(`denied:${reason}`),
  ),
}))

const { startGoogleAdsConnectAction } = await import(
  "@/features/integration-google-ads/actions/start-connect.action"
)
const { startGoogleAdsReconnectAction } = await import(
  "@/features/integration-google-ads/actions/start-reconnect.action"
)
const { pickGoogleAdsAccountAction } = await import(
  "@/features/integration-google-ads/actions/pick-account.action"
)
const { cancelGoogleAdsConnectAction } = await import(
  "@/features/integration-google-ads/actions/cancel-connect.action"
)
const { disconnectGoogleAdsAction } = await import(
  "@/features/integration-google-ads/actions/disconnect.action"
)
const { syncGoogleAdsConversionActionsAction } = await import(
  "@/features/integration-google-ads/actions/sync-conversion-actions.action"
)
const { retryGoogleAdsEventAction } = await import(
  "@/features/integration-google-ads/actions/retry-event.action"
)
const { updateGoogleAdsConsentAction } = await import(
  "@/features/integration-google-ads/actions/update-consent.action"
)
const { validateGoogleAdsRequestAction } = await import(
  "@/features/integration-google-ads/actions/validate-request.action"
)
const { getCurrentUserId } = await import("@/lib/auth/utils")
const { findOrFail } = await import("@chatbotx.io/database/client")
const { getAllWorkspaceMembers } = await import(
  "@/features/workspace-members/queries"
)

const connection = { id: "conn-1", provider: "googleAds" }
const connectedSetup = {
  connection,
  readiness: "ready",
  integration: { setupError: null },
}
const consentSession = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  provider: "googleAds",
  returnUrl: `/space/${WORKSPACE_ID}/settings/integrations/google-ads`,
  nextAction: { type: "open_url", url: CONSENT_URL },
}
const googleAdsSession = { id: SESSION_ID, provider: "googleAds" }

const CONSENT = {
  adUserData: { type: "granted" },
  adPersonalization: { type: "variable", template: "{{gdpr}}" },
} as const

const redirectDigest = (url: string) =>
  expect.objectContaining({ digest: expect.stringContaining(url) })

/** Mutations that must refuse a platform support session, with a way to invoke each. */
const SUPPORT_REJECTING_ACTIONS: Record<string, () => Promise<unknown>> = {
  startConnect: () => startGoogleAdsConnectAction(WORKSPACE_ID),
  startReconnect: () => startGoogleAdsReconnectAction(WORKSPACE_ID),
  pickAccount: () =>
    pickGoogleAdsAccountAction(WORKSPACE_ID, {
      sessionId: SESSION_ID,
      customerId: CUSTOMER_ID,
    }),
  cancelConnect: () =>
    cancelGoogleAdsConnectAction(WORKSPACE_ID, { sessionId: SESSION_ID }),
  disconnect: () => disconnectGoogleAdsAction(WORKSPACE_ID),
  retryEvent: () => retryGoogleAdsEventAction(WORKSPACE_ID, { eventId: "900" }),
  updateConsent: () => updateGoogleAdsConsentAction(WORKSPACE_ID, CONSENT),
  validateRequest: () =>
    validateGoogleAdsRequestAction(WORKSPACE_ID, {
      conversionActionId: "12345",
      clickIdType: "gclid",
      clickId: CLICK_ID,
    }),
}

const everyServiceMock = () => [
  mocks.startConnect,
  mocks.startReconnect,
  mocks.connectTargets,
  mocks.disconnect,
  mocks.cancel,
  mocks.cancelPendingByProvider,
  mocks.completeSelection,
  mocks.refreshSetup,
  mocks.validateIngest,
  mocks.retry,
  mocks.updateConsent,
]

beforeEach(() => {
  mocks.isSupportSession.value = false
  mocks.isTrialExpired.value = false
  vi.mocked(getCurrentUserId).mockResolvedValue("user-1")
  vi.mocked(findOrFail).mockResolvedValue({ id: "user-1" } as never)
  vi.mocked(getAllWorkspaceMembers).mockResolvedValue({
    workspaces: [{ id: WORKSPACE_ID }],
    workspaceMembers: [{ workspaceId: WORKSPACE_ID, permissions: {} }],
    workspaceIds: [WORKSPACE_ID],
  } as never)
  mocks.assertWorkspaceSuperAdmin.mockResolvedValue(undefined)
  mocks.isConfigured.mockResolvedValue(true)
  mocks.getSetup.mockResolvedValue(connectedSetup)
  mocks.refreshSetup.mockResolvedValue(connectedSetup)
  mocks.resolvePlatformOwnerId.mockResolvedValue("owner-1")
  mocks.getOriginUrlFromHeader.mockResolvedValue(
    `https://app.test/space/${WORKSPACE_ID}/settings/integrations/google-ads?x=1`,
  )
  mocks.startConnect.mockResolvedValue({
    connection: null,
    session: consentSession,
  })
  mocks.startReconnect.mockResolvedValue({ session: consentSession })
  mocks.findByIdForWorkspace.mockResolvedValue(googleAdsSession)
  mocks.connectTargets.mockResolvedValue({
    outcomes: [{ targetId: CUSTOMER_ID, status: "connected" }],
  })
  mocks.retry.mockResolvedValue({ status: "retried" })
  mocks.updateConsent.mockImplementation(async (_id, consent) => consent)
  mocks.validateIngest.mockResolvedValue({ ok: true })
})

describe("authorization (every mutation)", () => {
  test.each(
    Object.entries(SUPPORT_REJECTING_ACTIONS),
  )("%s rejects a platform support session without side effects", async (_name, invoke) => {
    mocks.isSupportSession.value = true

    const result = (await invoke()) as { serverError?: string }

    expect(result.serverError).toBe("googleAds.errors.supportSession")
    for (const mock of everyServiceMock()) {
      expect(mock).not.toHaveBeenCalled()
    }
  })

  test.each(
    Object.entries(SUPPORT_REJECTING_ACTIONS),
  )("%s requires a workspace super admin", async (_name, invoke) => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValue(
      new Error("superAdminRequired"),
    )

    const result = (await invoke()) as { serverError?: string }

    expect(result.serverError).toBeDefined()
    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith(WORKSPACE_ID)
    for (const mock of everyServiceMock()) {
      expect(mock).not.toHaveBeenCalled()
    }
  })

  test("sync requires a super admin but is allowed in a support session", async () => {
    mocks.isSupportSession.value = true
    await expect(
      syncGoogleAdsConversionActionsAction(WORKSPACE_ID),
    ).resolves.toMatchObject({ data: { readiness: "ready" } })

    mocks.assertWorkspaceSuperAdmin.mockRejectedValue(new Error("denied"))
    mocks.refreshSetup.mockClear()
    const denied = await syncGoogleAdsConversionActionsAction(WORKSPACE_ID)
    expect(denied.serverError).toBeDefined()
    expect(mocks.refreshSetup).not.toHaveBeenCalled()
  })

  test("the workspace comes from the bound argument, not client input", async () => {
    await retryGoogleAdsEventAction(WORKSPACE_ID, { eventId: "900" })

    expect(mocks.retry).toHaveBeenCalledWith({
      id: "900",
      workspaceId: WORKSPACE_ID,
    })
    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith(WORKSPACE_ID)
  })

  test("a workspace the caller is not a member of is refused", async () => {
    vi.mocked(getAllWorkspaceMembers).mockResolvedValue({
      workspaces: [],
      workspaceMembers: [],
      workspaceIds: [],
    } as never)

    const result = await retryGoogleAdsEventAction("999", { eventId: "900" })

    expect(result.serverError).toBeDefined()
    expect(mocks.retry).not.toHaveBeenCalled()
  })
})

describe("startGoogleAdsConnectAction", () => {
  test("refuses with a typed error when the developer token is missing", async () => {
    mocks.isConfigured.mockResolvedValue(false)

    const result = await startGoogleAdsConnectAction(WORKSPACE_ID)

    expect(result.serverError).toBe("googleAds.errors.developerTokenMissing")
    expect(mocks.isConfigured).toHaveBeenCalledWith(WORKSPACE_ID)
    expect(mocks.startConnect).not.toHaveBeenCalled()
  })

  test("starts the engine with an absolute origin-only settings URL and redirects to consent", async () => {
    await expect(startGoogleAdsConnectAction(WORKSPACE_ID)).rejects.toEqual(
      redirectDigest(CONSENT_URL),
    )

    expect(mocks.startConnect).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      provider: "googleAds",
      config: undefined,
      redirectUrl: SETTINGS_URL,
      ownerId: "owner-1",
      actor: { actorUserId: "user-1" },
    })
    expect(mocks.resolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: WORKSPACE_ID,
    })
  })

  test("points the session's return URL at its own id before redirecting to consent", async () => {
    await expect(startGoogleAdsConnectAction(WORKSPACE_ID)).rejects.toEqual(
      redirectDigest(CONSENT_URL),
    )

    expect(mocks.updateReturnUrl).toHaveBeenCalledWith({
      id: SESSION_ID,
      returnUrl: `/space/${WORKSPACE_ID}/settings/integrations/google-ads?session=${SESSION_ID}`,
    })
  })

  test("does not rewrite the return URL when there is no consent url", async () => {
    mocks.startConnect.mockResolvedValue({
      connection: null,
      session: { ...consentSession, nextAction: null },
    })

    await startGoogleAdsConnectAction(WORKSPACE_ID)

    expect(mocks.updateReturnUrl).not.toHaveBeenCalled()
  })

  test("falls back to the builder origin when the request URL header is empty", async () => {
    mocks.getOriginUrlFromHeader.mockResolvedValue("")

    await expect(startGoogleAdsConnectAction(WORKSPACE_ID)).rejects.toEqual(
      redirectDigest(CONSENT_URL),
    )

    expect(mocks.startConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: `https://builder.test/space/${WORKSPACE_ID}/settings/integrations/google-ads`,
      }),
    )
  })

  test("cancels this workspace's abandoned pending Google Ads sessions before starting", async () => {
    const order: string[] = []
    mocks.cancelPendingByProvider.mockImplementation(() => {
      order.push("cancel")
      return Promise.resolve(1)
    })
    mocks.startConnect.mockImplementation(() => {
      order.push("start")
      return Promise.resolve({ connection: null, session: consentSession })
    })

    await expect(startGoogleAdsConnectAction(WORKSPACE_ID)).rejects.toEqual(
      redirectDigest(CONSENT_URL),
    )

    expect(mocks.cancelPendingByProvider).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      provider: "googleAds",
    })
    expect(order).toEqual(["cancel", "start"])
  })

  test("a session without a consent url is a typed error, not a redirect", async () => {
    mocks.startConnect.mockResolvedValue({
      connection: null,
      session: { ...consentSession, nextAction: null },
    })

    const result = await startGoogleAdsConnectAction(WORKSPACE_ID)

    expect(result.serverError).toBe("googleAds.errors.authorizationUnavailable")
  })
})

describe("startGoogleAdsReconnectAction", () => {
  test("refuses when the developer token is missing", async () => {
    mocks.isConfigured.mockResolvedValue(false)

    const result = await startGoogleAdsReconnectAction(WORKSPACE_ID)

    expect(result.serverError).toBe("googleAds.errors.developerTokenMissing")
    expect(mocks.startReconnect).not.toHaveBeenCalled()
  })

  test("refuses when there is no connection to reconnect", async () => {
    mocks.getSetup.mockResolvedValue(null)

    const result = await startGoogleAdsReconnectAction(WORKSPACE_ID)

    expect(result.serverError).toBe("googleAds.errors.notConnected")
    expect(mocks.startReconnect).not.toHaveBeenCalled()
  })

  test("reconnects the workspace's own connection and redirects to consent", async () => {
    await expect(startGoogleAdsReconnectAction(WORKSPACE_ID)).rejects.toEqual(
      redirectDigest(CONSENT_URL),
    )

    expect(mocks.startReconnect).toHaveBeenCalledWith({
      connection,
      workspaceId: WORKSPACE_ID,
      redirectUrl: SETTINGS_URL,
      ownerId: "owner-1",
      actor: { actorUserId: "user-1" },
    })
  })
})

describe("startGoogleAdsReconnectAction stale sessions", () => {
  test("cancels this workspace's abandoned pending sessions before reconnecting", async () => {
    const order: string[] = []
    mocks.cancelPendingByProvider.mockImplementation(() => {
      order.push("cancel")
      return Promise.resolve(1)
    })
    mocks.startReconnect.mockImplementation(() => {
      order.push("start")
      return Promise.resolve({ connection, session: consentSession })
    })

    await expect(startGoogleAdsReconnectAction(WORKSPACE_ID)).rejects.toEqual(
      redirectDigest(CONSENT_URL),
    )

    expect(mocks.cancelPendingByProvider).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      provider: "googleAds",
    })
    expect(order).toEqual(["cancel", "start"])
  })

  test("does not cancel anything when the developer token is missing", async () => {
    mocks.isConfigured.mockResolvedValue(false)
    await startGoogleAdsReconnectAction(WORKSPACE_ID)
    expect(mocks.cancelPendingByProvider).not.toHaveBeenCalled()
  })
})

describe("startGoogleAdsReconnectAction return url", () => {
  test("points the reconnect session's return URL at its own id", async () => {
    await expect(startGoogleAdsReconnectAction(WORKSPACE_ID)).rejects.toEqual(
      redirectDigest(CONSENT_URL),
    )

    expect(mocks.updateReturnUrl).toHaveBeenCalledWith({
      id: SESSION_ID,
      returnUrl: `/space/${WORKSPACE_ID}/settings/integrations/google-ads?session=${SESSION_ID}`,
    })
  })
})

describe("pickGoogleAdsAccountAction", () => {
  const input = { sessionId: SESSION_ID, customerId: CUSTOMER_ID }

  test("rejects a session that is not in this workspace before connecting", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)

    const result = await pickGoogleAdsAccountAction(WORKSPACE_ID, input)

    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(result.serverError).toBe("googleAds.errors.sessionNotFound")
    expect(mocks.connectTargets).not.toHaveBeenCalled()
  })

  test("rejects a session of another provider before connecting", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: SESSION_ID,
      provider: "googleCalendar",
    })

    const result = await pickGoogleAdsAccountAction(WORKSPACE_ID, input)

    expect(result.serverError).toBe("googleAds.errors.sessionNotFound")
    expect(mocks.connectTargets).not.toHaveBeenCalled()
    expect(mocks.refreshSetup).not.toHaveBeenCalled()
  })

  test("rejects a malformed customer id", async () => {
    const result = await pickGoogleAdsAccountAction(WORKSPACE_ID, {
      sessionId: SESSION_ID,
      customerId: "111-222-3333",
    })

    expect(result.validationErrors).toBeDefined()
    expect(mocks.connectTargets).not.toHaveBeenCalled()
  })

  test("connects exactly the chosen customer, then refreshes the setup", async () => {
    const result = await pickGoogleAdsAccountAction(WORKSPACE_ID, input)

    expect(mocks.connectTargets).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      targetIds: [CUSTOMER_ID],
      actorUserId: "user-1",
    })
    expect(mocks.refreshSetup).toHaveBeenCalledWith(WORKSPACE_ID)
    expect(mocks.connectTargets.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshSetup.mock.invocationCallOrder[0] ?? 0,
    )
    expect(result.data).toEqual({ readiness: "ready", setupError: null })
  })

  test("completes the session after a successful pick so remaining candidates cannot be picked", async () => {
    await pickGoogleAdsAccountAction(WORKSPACE_ID, input)

    expect(mocks.completeSelection).toHaveBeenCalledWith({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(mocks.connectTargets.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.completeSelection.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("a completeSelection failure after the connect rejects the action", async () => {
    mocks.completeSelection.mockRejectedValueOnce(new Error("db down"))

    const result = await pickGoogleAdsAccountAction(WORKSPACE_ID, input)

    expect(result.serverError).toBeDefined()
    expect(result.data).toBeUndefined()
    expect(mocks.connectTargets).toHaveBeenCalledTimes(1)
    expect(mocks.refreshSetup).not.toHaveBeenCalled()
  })

  test("a retry whose duplicated outcome is this workspace's own customer completes and refreshes", async () => {
    mocks.connectTargets.mockResolvedValue({
      outcomes: [{ targetId: CUSTOMER_ID, status: "duplicated" }],
    })
    mocks.getSetup.mockResolvedValue({
      ...connectedSetup,
      integration: { customerId: CUSTOMER_ID, setupError: null },
    })

    const result = await pickGoogleAdsAccountAction(WORKSPACE_ID, input)

    expect(mocks.getSetup).toHaveBeenCalledWith(WORKSPACE_ID)
    expect(mocks.completeSelection).toHaveBeenCalledWith({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(mocks.completeSelection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshSetup.mock.invocationCallOrder[0] ?? 0,
    )
    expect(result.data).toEqual({ readiness: "ready", setupError: null })
  })

  test.each([
    ["a different customer", { customerId: "9999999999" }, "ready"],
    ["no integration in this workspace", null, "ready"],
    ["an inactive connection", { customerId: CUSTOMER_ID }, "needs_reauth"],
  ])("a duplicated outcome with %s is still pickFailed", async (_label, integration, readiness) => {
    mocks.connectTargets.mockResolvedValue({
      outcomes: [{ targetId: CUSTOMER_ID, status: "duplicated" }],
    })
    mocks.getSetup.mockResolvedValue(
      integration
        ? {
            connection,
            readiness,
            integration: { ...integration, setupError: null },
          }
        : null,
    )

    const result = await pickGoogleAdsAccountAction(WORKSPACE_ID, input)

    expect(result.serverError).toBe("googleAds.errors.pickFailed")
    expect(mocks.completeSelection).not.toHaveBeenCalled()
    expect(mocks.refreshSetup).not.toHaveBeenCalled()
  })

  test.each([
    "duplicated",
    "failed",
    "limitReached",
  ])("a %s outcome is a typed error and skips the setup refresh", async (status) => {
    mocks.connectTargets.mockResolvedValue({
      outcomes: [{ targetId: CUSTOMER_ID, status }],
    })

    const result = await pickGoogleAdsAccountAction(WORKSPACE_ID, input)

    expect(result.serverError).toBe("googleAds.errors.pickFailed")
    expect(mocks.refreshSetup).not.toHaveBeenCalled()
    expect(mocks.completeSelection).not.toHaveBeenCalled()
  })
})

describe("cancelGoogleAdsConnectAction", () => {
  test("does not cancel a session of another workspace or provider", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: SESSION_ID,
      provider: "messenger",
    })

    const result = await cancelGoogleAdsConnectAction(WORKSPACE_ID, {
      sessionId: SESSION_ID,
    })

    expect(result.serverError).toBe("googleAds.errors.sessionNotFound")
    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  test("stays available to a trial-expired workspace", async () => {
    mocks.isTrialExpired.value = true

    const result = await cancelGoogleAdsConnectAction(WORKSPACE_ID, {
      sessionId: SESSION_ID,
    })

    expect(result.serverError).toBeUndefined()
    expect(mocks.cancel).toHaveBeenCalledWith({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
    })
  })

  test("cancels the verified session", async () => {
    await cancelGoogleAdsConnectAction(WORKSPACE_ID, { sessionId: SESSION_ID })

    expect(mocks.cancel).toHaveBeenCalledWith({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
    })
  })
})

describe("disconnectGoogleAdsAction", () => {
  test("disconnects the workspace's own connection", async () => {
    await disconnectGoogleAdsAction(WORKSPACE_ID)

    expect(mocks.disconnect).toHaveBeenCalledWith({
      connectionId: "conn-1",
      workspaceId: WORKSPACE_ID,
    })
  })

  test("is typed when nothing is connected", async () => {
    mocks.getSetup.mockResolvedValue({ connection: undefined })

    const result = await disconnectGoogleAdsAction(WORKSPACE_ID)

    expect(result.serverError).toBe("googleAds.errors.notConnected")
    expect(mocks.disconnect).not.toHaveBeenCalled()
  })

  test("stays available to a trial-expired workspace while other mutations are blocked", async () => {
    mocks.isTrialExpired.value = true

    await disconnectGoogleAdsAction(WORKSPACE_ID)
    const blocked = await retryGoogleAdsEventAction(WORKSPACE_ID, {
      eventId: "900",
    })

    expect(mocks.disconnect).toHaveBeenCalledTimes(1)
    expect(blocked.serverError).toBeDefined()
    expect(mocks.retry).not.toHaveBeenCalled()
  })
})

describe("syncGoogleAdsConversionActionsAction", () => {
  test("returns the readiness and setup error", async () => {
    mocks.refreshSetup.mockResolvedValue({
      readiness: "setup_incomplete",
      integration: { setupError: "sync_failed" },
    })

    const result = await syncGoogleAdsConversionActionsAction(WORKSPACE_ID)

    expect(result.data).toEqual({
      readiness: "setup_incomplete",
      setupError: "sync_failed",
    })
  })

  test("is typed when no integration exists", async () => {
    mocks.refreshSetup.mockResolvedValue(null)

    const result = await syncGoogleAdsConversionActionsAction(WORKSPACE_ID)

    expect(result.serverError).toBe("googleAds.errors.notConnected")
  })
})

describe("retryGoogleAdsEventAction", () => {
  test("maps notRetryable to a typed error", async () => {
    mocks.retry.mockResolvedValue({ status: "notRetryable" })

    const result = await retryGoogleAdsEventAction(WORKSPACE_ID, {
      eventId: "900",
    })

    expect(result.serverError).toBe("googleAds.errors.notRetryable")
  })

  test("succeeds when the event was redriven", async () => {
    const result = await retryGoogleAdsEventAction(WORKSPACE_ID, {
      eventId: "900",
    })

    expect(result.serverError).toBeUndefined()
  })
})

describe("validateGoogleAdsRequestAction", () => {
  const input = {
    conversionActionId: "12345",
    clickIdType: "gclid" as const,
    clickId: CLICK_ID,
  }

  test("rejects a malformed click id before calling Google", async () => {
    const result = await validateGoogleAdsRequestAction(WORKSPACE_ID, {
      ...input,
      clickId: "short",
    })

    expect(result.validationErrors).toBeDefined()
    expect(mocks.validateIngest).not.toHaveBeenCalled()
  })

  test("rejects a non-numeric conversion action id", async () => {
    const result = await validateGoogleAdsRequestAction(WORKSPACE_ID, {
      ...input,
      conversionActionId: "1 OR 1=1",
    })

    expect(result.validationErrors).toBeDefined()
    expect(mocks.validateIngest).not.toHaveBeenCalled()
  })

  test("passes the consent summary through and nothing else", async () => {
    mocks.validateIngest.mockResolvedValue({
      ok: true,
      consentSummary: {
        adUserData: "granted",
        adPersonalization: "notSentLegacy",
      },
      variableSkipped: true,
      withheldAdPersonalization: "denied",
      internal: "never returned",
    })

    const result = await validateGoogleAdsRequestAction(WORKSPACE_ID, input)

    expect(result.data).toEqual({
      ok: true,
      consentSummary: {
        adUserData: "granted",
        adPersonalization: "notSentLegacy",
      },
      variableSkipped: true,
      withheldAdPersonalization: "denied",
    })
  })

  test("never returns the click id on success", async () => {
    const result = await validateGoogleAdsRequestAction(WORKSPACE_ID, input)

    expect(mocks.validateIngest).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      ...input,
    })
    expect(result.data).toEqual({ ok: true })
    expect(JSON.stringify(result)).not.toContain(CLICK_ID)
  })

  test("redacts the click id if a failure detail echoes it", async () => {
    mocks.validateIngest.mockResolvedValue({
      ok: false,
      code: "rejected",
      detail: `invalid click ${CLICK_ID} for action`,
    })

    const result = await validateGoogleAdsRequestAction(WORKSPACE_ID, input)

    expect(result.data).toEqual({
      ok: false,
      code: "rejected",
      detail: "invalid click [redacted] for action",
    })
    expect(JSON.stringify(result)).not.toContain(CLICK_ID)
  })

  test.each([
    "accountNotReady",
    "needsReauth",
    "consentInvalid",
  ] as const)("passes the %s code through with no detail", async (code) => {
    mocks.validateIngest.mockResolvedValue({ ok: false, code })

    const result = await validateGoogleAdsRequestAction(WORKSPACE_ID, input)

    expect(result.data).toEqual({ ok: false, code, detail: undefined })
  })
})

describe("updateGoogleAdsConsentAction", () => {
  test("saves the consent for the bound workspace only", async () => {
    const result = await updateGoogleAdsConsentAction(WORKSPACE_ID, CONSENT)

    expect(result.data).toEqual(CONSENT)
    expect(mocks.updateConsent).toHaveBeenCalledTimes(1)
    expect(mocks.updateConsent).toHaveBeenCalledWith(WORKSPACE_ID, CONSENT)
    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith(WORKSPACE_ID)
  })

  test("strips unknown keys, including a payload workspaceId", async () => {
    await updateGoogleAdsConsentAction(WORKSPACE_ID, {
      ...CONSENT,
      workspaceId: "999",
      adUserData: { type: "granted", template: "{{x}}", extra: true },
    } as never)

    expect(mocks.updateConsent).toHaveBeenCalledWith(WORKSPACE_ID, {
      adUserData: { type: "granted" },
      adPersonalization: CONSENT.adPersonalization,
    })
  })

  test("rejects an invalid consent without writing", async () => {
    const result = await updateGoogleAdsConsentAction(WORKSPACE_ID, {
      adUserData: { type: "variable", template: "no placeholder" },
      adPersonalization: { type: "notProvided" },
    })

    expect(result.validationErrors).toBeDefined()
    expect(mocks.updateConsent).not.toHaveBeenCalled()
  })

  test("a workspace the caller is not a member of is not writable", async () => {
    vi.mocked(getAllWorkspaceMembers).mockResolvedValue({
      workspaces: [],
      workspaceMembers: [],
      workspaceIds: [],
    } as never)

    const result = await updateGoogleAdsConsentAction("999", CONSENT)

    expect(result.serverError).toBeDefined()
    expect(mocks.updateConsent).not.toHaveBeenCalled()
  })

  test("is blocked for a trial-expired workspace", async () => {
    mocks.isTrialExpired.value = true

    const result = await updateGoogleAdsConsentAction(WORKSPACE_ID, CONSENT)

    expect(result.serverError).toBeDefined()
    expect(mocks.updateConsent).not.toHaveBeenCalled()
  })
})
