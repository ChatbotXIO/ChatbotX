// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  googleAdsConversionService,
  integrationGoogleAdsService,
  googleAdsSettingsService,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  googleAdsConversionService: { getStats: vi.fn(), listEvents: vi.fn() },
  integrationGoogleAdsService: { getPublicSetup: vi.fn() },
  googleAdsSettingsService: { getConsent: vi.fn() },
}))

vi.mock("@chatbotx.io/business", async () => {
  // The real response schema (pure zod) so output parsing is exercised.
  const { googleAdsStatsResponse } = await import(
    "../../../packages/business/src/google-ads/stats-schema"
  )
  return {
    workspaceApiTokenService: { findWorkspaceByTokenHash },
    isWorkspaceScheduledForDeletion,
    userQuotaService: { getAccessState },
    quotaEnforcementService: { isAtLimit },
    googleAdsConversionService,
    integrationGoogleAdsService,
    googleAdsSettingsService,
    googleAdsStatsResponse,
  }
})

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((_key: string, loader: () => unknown) => loader()),
  invalidateCacheByTags: vi.fn(),
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({ assertApiNotRateLimited }))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
// `@/orpc` also exports `authorizedAPI`, which pulls in the better-auth stack.
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const { call } = await import("@orpc/server")
const { googleAdsPublicRouter } = await import(
  "../src/features/integration-google-ads/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (
  scopes: string[] | null,
  permission: "full" | "read_only" = "full",
) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission, scopes },
})

// Heterogeneous procedures from one router: intentionally untyped.
const invoke = (procedure: any, input: Record<string, unknown> = {}) =>
  call(procedure, input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

const counts = {
  pending: 0,
  sending: 0,
  sent: 0,
  processed: 0,
  failed: 0,
  skipped_no_account: 0,
  skipped_expired: 0,
}

const statsResult = {
  range: { from: "2026-10-01", to: "2026-10-02", tz: "UTC" },
  totals: { ...counts, processed: 3, total: 3, deliveryRate: 1 },
  failuresByStage: { delivery: 0, processing: 0, timeout: 0, unknown: 0 },
  confirmedValue: [{ currency: "USD", value: "30.50", count: 3 }],
  timeseries: [
    { date: "2026-10-01", counts: { ...counts, processed: 3 } },
    { date: "2026-10-02", counts },
  ],
  byAction: [],
  byActionTruncated: false,
  byChannel: [],
}

const CLICK_ID = "Cj0KCQiAFULLCLICKIDxyz9"
const TRANSACTION_ID = "gads-ws1-9f8e7d6c"
const REQUEST_ID = "req-7c1a-4b2d"

const eventRow = (overrides: Record<string, unknown> = {}) => ({
  id: "900",
  workspaceId: "ws-1",
  contactInboxId: "ci-1",
  status: "failed",
  failureStage: "delivery",
  processingStatus: null,
  error: `bad ${CLICK_ID} / ${TRANSACTION_ID} / ${REQUEST_ID}`,
  channel: "whatsapp",
  conversionActionId: "7788",
  conversionActionName: "Lead",
  uploadMethod: "dataManager",
  clickIdType: "gclid",
  clickId: CLICK_ID,
  occurredAt: new Date("2026-10-01T00:00:00Z"),
  sentAt: null,
  value: "12.50",
  currency: "USD",
  claimToken: "CLAIM-SECRET",
  requestId: REQUEST_ID,
  transactionId: TRANSACTION_ID,
  attempt: 3,
  options: null,
  ...overrides,
})

const setup = {
  connected: true,
  readiness: "ready",
  customerId: "1112223333",
  descriptiveName: "Acme",
  currencyCode: "USD",
  uploadMethod: "dataManager",
  acceptedCustomerDataTerms: true,
  setupError: null,
  conversionActions: [
    {
      id: "1",
      name: "Lead",
      category: "SIGNUP",
      status: "ENABLED",
      countingType: "ONE_PER_CLICK",
      attributionModel: null,
    },
  ],
  conversionActionsSyncedAt: new Date("2026-10-01T00:00:00Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
  findWorkspaceByTokenHash.mockResolvedValue(authResult(["ads"]))
  googleAdsConversionService.getStats.mockResolvedValue(statsResult)
  googleAdsConversionService.listEvents.mockResolvedValue({
    rows: [],
    total: 0,
  })
  integrationGoogleAdsService.getPublicSetup.mockResolvedValue(setup)
  googleAdsSettingsService.getConsent.mockResolvedValue({
    status: "absent",
    consent: {
      adUserData: { type: "notProvided" },
      adPersonalization: { type: "notProvided" },
    },
  })
})

const operations = [
  ["getStats", { from: "2026-10-01", to: "2026-10-02" }],
  ["listEvents", {}],
  ["getConnection", {}],
] as const

describe("googleAdsPublicRouter shape", () => {
  test("exposes exactly the three read operations", () => {
    expect(Object.keys(googleAdsPublicRouter).sort()).toEqual([
      "getConnection",
      "getStats",
      "listEvents",
    ])
  })
})

describe("scope enforcement", () => {
  test.each(
    operations,
  )("%s denies a token without the ads scope", async (name, input) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(googleAdsPublicRouter[name], input),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'ads' scope",
    })
  })

  test.each(
    operations,
  )("%s allows unrestricted (null scopes) tokens", async (name, input) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))

    await expect(
      invoke(googleAdsPublicRouter[name], input),
    ).resolves.toBeDefined()
  })

  test.each(
    operations,
  )("%s allows a read-only token (GET)", async (name, input) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["ads"], "read_only"))

    await expect(
      invoke(googleAdsPublicRouter[name], input),
    ).resolves.toBeDefined()
  })
})

describe("googleAds.getStats", () => {
  test("passes the workspace from the token and the filters through", async () => {
    const result = await invoke(googleAdsPublicRouter.getStats, {
      from: "2026-10-01",
      to: "2026-10-02",
      tz: "Asia/Ho_Chi_Minh",
      channel: "messenger",
      conversionActionId: "7788",
    })

    expect(googleAdsConversionService.getStats).toHaveBeenCalledWith({
      from: "2026-10-01",
      to: "2026-10-02",
      tz: "Asia/Ho_Chi_Minh",
      channel: "messenger",
      conversionActionId: "7788",
      workspaceId: "ws-1",
    })
    expect(result).toEqual(statsResult)
  })

  test("ignores a client-supplied workspaceId and never returns one", async () => {
    const result = await invoke(googleAdsPublicRouter.getStats, {
      from: "2026-10-01",
      to: "2026-10-02",
      workspaceId: "other-ws",
    })

    expect(googleAdsConversionService.getStats).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
    expect(JSON.stringify(result)).not.toContain("workspaceId")
  })

  test("echoes the range the service resolved", async () => {
    googleAdsConversionService.getStats.mockResolvedValue({
      ...statsResult,
      range: { from: "2025-10-02", to: "2026-10-02", tz: "UTC" },
    })

    const result = await invoke(googleAdsPublicRouter.getStats, {
      from: "2020-01-01",
      to: "2026-10-02",
      tz: "Not/AZone",
    })

    expect(result).toMatchObject({
      range: { from: "2025-10-02", to: "2026-10-02", tz: "UTC" },
    })
  })

  test.each([
    ["a non-date from", { from: "yesterday", to: "2026-10-02" }],
    ["a non-date to", { from: "2026-10-01", to: "10/02/2026" }],
    ["a missing to", { from: "2026-10-01" }],
    [
      "an unknown channel",
      { from: "2026-10-01", to: "2026-10-02", channel: "sms" },
    ],
    [
      "a non-numeric action",
      { from: "2026-10-01", to: "2026-10-02", conversionActionId: "abc" },
    ],
  ])("rejects %s with 422 before the service", async (_label, input) => {
    await expect(
      invoke(googleAdsPublicRouter.getStats, input),
    ).rejects.toMatchObject({
      status: 422,
    })
    expect(googleAdsConversionService.getStats).not.toHaveBeenCalled()
  })
})

describe("googleAds.listEvents", () => {
  test("returns the masked, redacted projection with no internal fields", async () => {
    googleAdsConversionService.listEvents.mockResolvedValue({
      rows: [eventRow()],
      total: 1,
    })

    const result = (await invoke(googleAdsPublicRouter.listEvents)) as {
      data: Record<string, unknown>[]
    }
    const wire = JSON.stringify(result)

    expect(result.data[0]?.maskedClickId).not.toBe(CLICK_ID)
    for (const secret of [
      CLICK_ID,
      TRANSACTION_ID,
      REQUEST_ID,
      "CLAIM-SECRET",
      "ws-1",
      "ci-1",
    ]) {
      expect(wire).not.toContain(secret)
    }
    expect(result.data[0]?.error).toBe(
      "bad [redacted] / [redacted] / [redacted]",
    )
    for (const key of [
      "workspaceId",
      "contactInboxId",
      "clickId",
      "transactionId",
      "requestId",
      "claimToken",
      "attempt",
    ]) {
      expect(result.data[0]).not.toHaveProperty(key)
    }
    expect(result.data[0]?.conversionActionId).toBe("7788")
  })

  test("passes filters and the workspace through to the service", async () => {
    await invoke(googleAdsPublicRouter.listEvents, {
      page: 2,
      perPage: 10,
      status: "failed",
      channel: "whatsapp",
      conversionActionId: "7788",
      since: "2026-10-01T00:00:00.000Z",
      until: "2026-10-02T00:00:00.000Z",
      workspaceId: "other-ws",
    })

    expect(googleAdsConversionService.listEvents).toHaveBeenCalledWith({
      page: 2,
      perPage: 10,
      status: "failed",
      channel: "whatsapp",
      conversionActionId: "7788",
      since: new Date("2026-10-01T00:00:00.000Z"),
      until: new Date("2026-10-02T00:00:00.000Z"),
      workspaceId: "ws-1",
    })
  })

  test("accepts perPage=50 and rejects 51 with 422", async () => {
    await expect(
      invoke(googleAdsPublicRouter.listEvents, { perPage: 50 }),
    ).resolves.toBeDefined()
    expect(googleAdsConversionService.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ perPage: 50 }),
    )

    googleAdsConversionService.listEvents.mockClear()
    await expect(
      invoke(googleAdsPublicRouter.listEvents, { perPage: 51 }),
    ).rejects.toMatchObject({ status: 422 })
    expect(googleAdsConversionService.listEvents).not.toHaveBeenCalled()
  })

  test.each([
    [0, 10, 1],
    [1, 10, 1],
    [10, 10, 1],
    [11, 10, 2],
    [101, 50, 3],
  ])("maps total %i at perPage %i to pageCount %i", async (total, perPage, pageCount) => {
    googleAdsConversionService.listEvents.mockResolvedValue({ rows: [], total })

    await expect(
      invoke(googleAdsPublicRouter.listEvents, { perPage }),
    ).resolves.toEqual({ data: [], pageCount })
  })

  test.each([
    ["an unknown status", { status: "done" }],
    ["an unknown channel", { channel: "sms" }],
    ["a non-numeric action", { conversionActionId: "abc" }],
    ["an invalid since", { since: "not-a-date" }],
  ])("rejects %s with 422", async (_label, input) => {
    await expect(
      invoke(googleAdsPublicRouter.listEvents, input),
    ).rejects.toMatchObject({ status: 422 })
  })
})

describe("googleAds.getConnection", () => {
  test("returns the credential-free view with consent", async () => {
    integrationGoogleAdsService.getPublicSetup.mockResolvedValue({
      ...setup,
      auth: { accessToken: "ya29.SECRET", refreshToken: "REFRESH" },
      developerToken: "DEV-TOKEN",
      workspaceId: "ws-1",
    })

    const result = await invoke(googleAdsPublicRouter.getConnection)
    const wire = JSON.stringify(result)

    expect(integrationGoogleAdsService.getPublicSetup).toHaveBeenCalledWith(
      "ws-1",
    )
    expect(googleAdsSettingsService.getConsent).toHaveBeenCalledWith("ws-1")
    expect(result).toMatchObject({
      connected: true,
      customerId: "1112223333",
      consent: { status: "absent" },
    })
    for (const leaked of [
      "SECRET",
      "REFRESH",
      "DEV-TOKEN",
      "auth",
      "workspaceId",
    ]) {
      expect(wire).not.toContain(leaked)
    }
  })

  test("reports not connected with no actions and the stored consent", async () => {
    integrationGoogleAdsService.getPublicSetup.mockResolvedValue({
      connected: false,
      readiness: null,
      customerId: null,
      descriptiveName: null,
      currencyCode: null,
      uploadMethod: null,
      acceptedCustomerDataTerms: null,
      setupError: null,
      conversionActions: [],
      conversionActionsSyncedAt: null,
    })
    googleAdsSettingsService.getConsent.mockResolvedValue({
      status: "ok",
      consent: {
        adUserData: { type: "granted" },
        adPersonalization: { type: "denied" },
      },
    })

    await expect(
      invoke(googleAdsPublicRouter.getConnection),
    ).resolves.toMatchObject({
      connected: false,
      readiness: null,
      conversionActions: [],
      consent: {
        status: "ok",
        adUserData: { type: "granted", template: null },
        adPersonalization: { type: "denied", template: null },
      },
    })
  })
})
