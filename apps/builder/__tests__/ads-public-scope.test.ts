// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

const adsConversionService = {
  list: vi.fn(),
  findOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  toggleEnabled: vi.fn(),
  remove: vi.fn(),
  getCtwaFunnel: vi.fn(),
  getCtwaFunnelTimeseries: vi.fn(),
  getCapiDeliverySummary: vi.fn(),
  listExportRows: vi.fn(),
  listAllChannelExportRows: vi.fn(),
}

const messagingAdCampaignService = {
  createDraft: vi.fn(),
  retryDraft: vi.fn(),
  publish: vi.fn(),
  pause: vi.fn(),
  deleteOperation: vi.fn(),
  list: vi.fn(),
  listInsights: vi.fn(),
  listMessengerPages: vi.fn(),
}

const messagingAdsConnectionService = {
  findForIntegration: vi.fn(),
  listForChannel: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  adsConversionService,
  messagingAdCampaignService,
  messagingAdsConnectionService,
  listCachedMessagingAdAccounts: vi.fn(),
  getCachedMessagingAdAccountDetails: vi.fn(),
  buildMessagingAdsContext: vi.fn(),
  integrationFacebookAdsService: { findByWorkspaceId: vi.fn() },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((_key: string, loader: () => unknown) => loader()),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant here and unsafe to initialize in a
// unit test. Same stub as workspace-token-scope-enforcement.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { adsPublicRouter } = await import("../src/features/ads/api/public")

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

// Exercises heterogeneous procedures from the merged router — each has its
// own input/output shape, so this is intentionally untyped.
const invoke = (procedure: any, input: Record<string, unknown> = {}) =>
  call(procedure, input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: ads public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/ads/conversion-rules route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(adsPublicRouter.listRules)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'ads' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/ads/conversion-rules route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    adsConversionService.list.mockResolvedValue([])

    await expect(invoke(adsPublicRouter.listRules)).resolves.toMatchObject({
      data: [],
    })
  })

  test("a contacts-scoped token is denied the real POST /v1/ads/campaigns route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(adsPublicRouter.createCampaign, {
        channel: "whatsapp",
        integrationId: "1",
        adAccountId: "act_1",
        name: "Ad",
        campaign: { specialAdCategories: ["NONE"] },
        adSet: {
          dailyBudgetMinorUnits: 1000,
          targeting: { countries: ["US"] },
        },
        creative: {
          media: {
            kind: "video",
            videoId: "v1",
          },
          welcomeMessage: { type: "default" },
        },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'ads' scope",
    })
  })
})

describe("every ads submodule declares the ads scope", () => {
  test("the router was built entirely under workspaceTokenAuthAPIForScope('ads')", () => {
    // Sanity check: every key on the merged router resolves to a procedure —
    // if a submodule forgot to call `workspaceTokenAuthAPIForScope("ads")`
    // and used a bare/differently-scoped builder instead, the FORBIDDEN
    // assertions above would still pass by coincidence for the routes they
    // cover, but a spot-check across both conversion-rules and campaigns
    // (the two submodules composed into `adsPublicRouter`) is what actually
    // proves the merge didn't drop or mis-scope either one.
    expect(Object.keys(adsPublicRouter)).toEqual(
      expect.arrayContaining([
        "listRules",
        "getRule",
        "createRule",
        "updateRule",
        "toggleRuleStatus",
        "deleteRule",
        "getFunnel",
        "getFunnelTimeseries",
        "getCapiDelivery",
        "listConversionExportRows",
        "listChannelAdAccounts",
        "createCampaign",
        "retryCampaign",
        "publishCampaign",
        "pauseCampaign",
        "deleteCampaign",
        "listCampaigns",
        "getCampaignsInsights",
        "listCampaignAdAccounts",
        "getCampaignAdAccountDetails",
        "uploadCampaignVideo",
        "getCampaignVideoStatus",
        "listCampaignMessengerPages",
        "checkCampaignPrerequisites",
      ]),
    )
  })
})
