import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// adsCampaignAuthenticatedAPI.getMessagingAdsInsights — the messaging-ads
// box's SEPARATE Ads Insights read (impressions/reach/spend/clicks/messaging
// conversations started/cost-per-conversation), never joined into
// `listMessagingAds`. Mirrors `ads-api.test.ts`'s approach of faking the
// `authorizedAPI` procedure builder so `.route()`/`.use()`/`.handler()` wiring
// is asserted without a real oRPC runtime, and mocking `@chatbotx.io/business`
// at the module boundary so no DB/Redis is touched.
// ---------------------------------------------------------------------------

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type InsightsInput = {
  workspaceId: string
  channel: string
  integrationId: string
  adAccountId: string
  adIds: string[]
  datePreset?: string
  refresh?: boolean
}

type ProcedureHandler = (args: {
  input: InsightsInput
}) => Promise<{ data: unknown[] }>

type WorkspaceMapper = (input: InsightsInput) => string

const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const state: {
      handlersByPath: Map<string, ProcedureHandler>
      routeConfigsByPath: Map<string, RouteConfig>
      lastRouteConfig?: RouteConfig
      lastMiddleware?: unknown
      lastWorkspaceMapper?: WorkspaceMapper
    } = {
      handlersByPath: new Map(),
      routeConfigsByPath: new Map(),
    }

    function makeProcedure(): unknown {
      const procedure = {
        route: vi.fn((config: RouteConfig) => {
          state.lastRouteConfig = config
          return procedure
        }),
        input: vi.fn(() => procedure),
        use: vi.fn((middleware: unknown, mapper: WorkspaceMapper) => {
          state.lastMiddleware = middleware
          state.lastWorkspaceMapper = mapper
          return procedure
        }),
        output: vi.fn(() => procedure),
        handler: vi.fn((handler: ProcedureHandler) => {
          const config = state.lastRouteConfig
          if (config) {
            state.handlersByPath.set(config.path, handler)
            state.routeConfigsByPath.set(config.path, config)
          }
          return { handler }
        }),
      }
      return procedure
    }

    return {
      authorizedAPI: makeProcedure(),
      mocks: {
        assertWorkspaceSuperAdmin: vi.fn(),
        listInsights: vi.fn(),
        state,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

// Every call to `authorizedAPI.route(...)` reuses the SAME faked procedure
// object (route/input/use/output/handler all return `this`), so each new
// `.route()` call simply overwrites `state.lastRouteConfig` before its own
// `.handler()` call snapshots it into `handlersByPath` — this is what lets
// one shared fake correctly wire up every endpoint in the file being tested.
vi.mock("@/orpc", () => ({ authorizedAPI }))

vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware,
}))

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))

vi.mock("@chatbotx.io/business", () => ({
  getCachedMessagingAdAccountDetails: vi.fn(),
  listCachedMessagingAdAccounts: vi.fn(),
  messagingAdCampaignService: {
    list: vi.fn(),
    listInsights: mocks.listInsights,
    listMessengerPages: vi.fn(),
  },
  messagingAdsConnectionService: {
    findForIntegration: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("../lib/facebook-ads-runner", () => ({
  getMessagingAdsContextForIntegration: vi.fn(),
}))

const INSIGHTS_PATH =
  "/workspaces/{workspaceId}/ads-campaign/messaging-ads/insights"

const { adsCampaignAuthenticatedAPI } = await import(
  "@/features/ads-campaign/api/authenticated"
)

const baseInput: InsightsInput = {
  workspaceId: "ws_1",
  channel: "messenger",
  integrationId: "im_1",
  adAccountId: "act_9",
  adIds: ["ad_1", "ad_2"],
}

describe("getMessagingAdsInsights", () => {
  test("registers as a POST endpoint, workspace-authorized, under adsCampaignAuthenticatedAPI", () => {
    expect(adsCampaignAuthenticatedAPI).toHaveProperty(
      "getMessagingAdsInsights",
    )
    const routeConfig = mocks.state.routeConfigsByPath.get(INSIGHTS_PATH)
    expect(routeConfig).toEqual({
      method: "POST",
      path: INSIGHTS_PATH,
      summary: expect.stringContaining("Ads Insights"),
      tags: ["AdsCampaign"],
    })
    expect(mocks.state.lastMiddleware).toBe(workspaceAuthorizedMidddleware)
  })

  test("the workspace mapper resolves workspaceId from the input", () => {
    expect(mocks.state.lastWorkspaceMapper?.(baseInput)).toBe("ws_1")
  })

  test("forwards adAccountId/adIds/channel/integrationId/workspaceId/datePreset and maps refresh -> forceRefresh", async () => {
    mocks.listInsights.mockResolvedValueOnce([
      {
        adId: "ad_1",
        currency: "USD",
        impressions: 100,
        reach: 80,
        spend: 5,
        clicks: 3,
        conversations: 1,
        costPerConversation: 5,
      },
    ])
    const handler = mocks.state.handlersByPath.get(INSIGHTS_PATH)

    const result = await handler?.({
      input: { ...baseInput, datePreset: "last_7d", refresh: true },
    })

    // Through the service (ownership-scoped), NOT the raw cached read; `refresh`
    // is mapped to `forceRefresh`.
    expect(mocks.listInsights).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
      adAccountId: "act_9",
      adIds: ["ad_1", "ad_2"],
      datePreset: "last_7d",
      forceRefresh: true,
    })
    expect(result).toEqual({
      data: [
        {
          adId: "ad_1",
          currency: "USD",
          impressions: 100,
          reach: 80,
          spend: 5,
          clicks: 3,
          conversations: 1,
          costPerConversation: 5,
        },
      ],
    })
  })

  test("never requires super-admin — this is a read-only endpoint", async () => {
    mocks.listInsights.mockResolvedValueOnce([])
    const handler = mocks.state.handlersByPath.get(INSIGHTS_PATH)

    await handler?.({ input: baseInput })

    expect(mocks.assertWorkspaceSuperAdmin).not.toHaveBeenCalled()
  })
})
