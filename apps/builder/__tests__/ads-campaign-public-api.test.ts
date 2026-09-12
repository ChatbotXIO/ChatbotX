// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

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
}

const listCachedMessagingAdAccounts = vi.fn()
const getCachedMessagingAdAccountDetails = vi.fn()
const buildMessagingAdsContext = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  messagingAdCampaignService,
  messagingAdsConnectionService,
  listCachedMessagingAdAccounts,
  getCachedMessagingAdAccountDetails,
  buildMessagingAdsContext,
}))

vi.mock("@chatbotx.io/integration-facebook-ads", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@chatbotx.io/integration-facebook-ads")
    >()
  return {
    ...actual,
    integration: { runAction: vi.fn() },
  }
})

await import("@/features/ads-campaign/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

const OPERATION_RECORD = {
  id: "op-1",
  workspaceId: "1001",
  channel: "whatsapp",
  adAccountId: "act_1",
  name: "Ad",
  createState: "created",
  publishState: "draft",
  metaCampaignId: null,
  metaAdSetId: null,
  metaAdCreativeId: null,
  metaAdId: null,
  lastError: null,
  cleanupError: null,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the ads-campaign public router under the ads scope", () => {
  expect(scopeArgAtImport).toBe("ads")
})

describe("POST /v1/ads/campaigns", () => {
  const procedure = findProcedure("POST", "/v1/ads/campaigns")

  test("creates a campaign with no session user in context and no createdBy", async () => {
    messagingAdCampaignService.createDraft.mockResolvedValueOnce(
      OPERATION_RECORD,
    )

    // No `context.user` at all — the token auth stack never sets one. This
    // must NOT throw `errors.superAdminRequired` (the private handler's
    // `assertWorkspaceSuperAdmin` guard, deliberately omitted here).
    const result = await procedure.handler?.({
      context: { workspace: { id: "1001" } },
      input: {
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
          media: { kind: "video", videoId: "v1" },
          welcomeMessage: { type: "default" },
        },
      },
    })

    expect(messagingAdCampaignService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1001" }),
    )
    // createdBy was never set on the merged input -> undefined, never a
    // session user's id.
    expect(
      messagingAdCampaignService.createDraft.mock.calls[0]?.[0].createdBy,
    ).toBeUndefined()
    // The public resource never leaks workspaceId.
    expect(result).not.toHaveProperty("workspaceId")
  })

  test("rejects a request failing the private re-validation with a 422 ORPCError, not a raw ZodError", async () => {
    const call = procedure.handler?.({
      context: { workspace: { id: "1001" } },
      input: {
        channel: "whatsapp",
        integrationId: "1",
        adAccountId: "act_1",
        name: "Ad",
        // `CREDIT` is accepted by the public schema's enum but rejected by
        // `createMessagingAdRequest`'s refine (deprecated by Meta) — this is
        // exactly the "private schema re-validation fails" case the handler
        // must turn into an explicit 422, not let a raw ZodError bubble up.
        campaign: { specialAdCategories: ["CREDIT"] },
        adSet: {
          dailyBudgetMinorUnits: 1000,
          targeting: { countries: ["US"] },
        },
        creative: {
          media: { kind: "video", videoId: "v1" },
          welcomeMessage: { type: "default" },
        },
      },
    })

    await expect(call).rejects.toMatchObject({
      code: "invalidRequestData",
      status: 422,
    })
    expect(messagingAdCampaignService.createDraft).not.toHaveBeenCalled()
  })
})

describe("POST /v1/ads/campaigns/{operationId}/publish", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/ads/campaigns/{operationId}/publish",
  )

  test("publishes with no session user in context", async () => {
    messagingAdCampaignService.publish.mockResolvedValueOnce(OPERATION_RECORD)

    const result = await procedure.handler?.({
      context: { workspace: { id: "1001" } },
      input: { operationId: "op-1" },
    })

    expect(messagingAdCampaignService.publish).toHaveBeenCalledWith({
      operationId: "op-1",
      workspaceId: "1001",
    })
    expect(result).not.toHaveProperty("workspaceId")
  })
})

describe("POST /v1/ads/campaigns/insights", () => {
  const procedure = findProcedure("POST", "/v1/ads/campaigns/insights")

  test("a full-permission token's refresh:true is forwarded as forceRefresh", async () => {
    messagingAdCampaignService.listInsights.mockResolvedValueOnce([])

    await procedure.handler?.({
      context: {
        workspace: { id: "1001" },
        apiToken: { permission: "full" },
      },
      input: {
        channel: "whatsapp",
        integrationId: "1",
        adAccountId: "act_1",
        adIds: ["ad_1"],
        refresh: true,
      },
    })

    expect(messagingAdCampaignService.listInsights).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: true }),
    )
  })

  test("a read_only token's refresh:true is NOT forwarded — it cannot force an uncached Graph call", async () => {
    messagingAdCampaignService.listInsights.mockResolvedValueOnce([])

    await procedure.handler?.({
      context: {
        workspace: { id: "1001" },
        apiToken: { permission: "read_only" },
      },
      input: {
        channel: "whatsapp",
        integrationId: "1",
        adAccountId: "act_1",
        adIds: ["ad_1"],
        refresh: true,
      },
    })

    expect(messagingAdCampaignService.listInsights).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: false }),
    )
  })
})

describe("GET /v1/ads/campaigns", () => {
  const procedure = findProcedure("GET", "/v1/ads/campaigns")

  test("sources workspaceId from context and strips it from every row", async () => {
    messagingAdCampaignService.list.mockResolvedValueOnce([
      { ...OPERATION_RECORD, effectiveStatus: null },
    ])

    const result = await procedure.handler?.({
      context: { workspace: { id: "1001" } },
      input: { channel: "whatsapp", integrationId: "1" },
    })

    expect(messagingAdCampaignService.list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1001" }),
    )
    expect(result?.data[0]).not.toHaveProperty("workspaceId")
  })
})
