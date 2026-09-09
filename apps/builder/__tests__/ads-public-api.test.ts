// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Mirrors `analytics-public-api.test.ts`: several ads business services are
// imported transitively by modules that open a real `pg.Pool` via
// `@chatbotx.io/database/client` at module load. Never reached by these
// handler-only tests, but the import chain must not try to open a
// connection.
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
}

const listCachedMessagingAdAccounts = vi.fn()
const getCachedMessagingAdAccountDetails = vi.fn()
const buildMessagingAdsContext = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService,
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
    integration: {
      runAction: vi.fn(),
    },
  }
})

const resolveChannelAdAccountSources = vi.fn()
vi.mock("@/features/ads/queries/channel-ad-accounts", () => ({
  resolveChannelAdAccountSources,
}))

await import("@/features/ads/api/public")

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

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the ads public router under the ads scope", () => {
  expect(scopeArgAtImport).toBe("ads")
})

describe("GET /v1/ads/conversion-rules", () => {
  const procedure = findProcedure("GET", "/v1/ads/conversion-rules")

  test("sources workspaceId from context, not input, and paginates in memory", async () => {
    adsConversionService.list.mockResolvedValueOnce([{ id: "r1" }])

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(adsConversionService.list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
    expect(result).toEqual({ data: [{ id: "r1" }], pageCount: 1 })
  })
})

describe("GET /v1/ads/conversion-rules/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ads/conversion-rules/{id}")

  test("sources workspaceId from context, not input", async () => {
    adsConversionService.findOrFail.mockResolvedValueOnce({ id: "r1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "r1" },
    })

    expect(adsConversionService.findOrFail).toHaveBeenCalledWith({
      id: "r1",
      workspaceId: "workspace-1",
    })
  })
})

describe("POST /v1/ads/conversion-rules", () => {
  const procedure = findProcedure("POST", "/v1/ads/conversion-rules")

  test("sources workspaceId from context, not input", async () => {
    adsConversionService.create.mockResolvedValueOnce({ id: "r1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { channel: "whatsapp", eventType: "lead", trigger: {} },
    })

    expect(adsConversionService.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/ads/funnel", () => {
  const procedure = findProcedure("GET", "/v1/ads/funnel")

  test("sources workspaceId from context, not input", async () => {
    adsConversionService.getCtwaFunnel.mockResolvedValueOnce({
      totals: { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
      perAd: [],
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { since: new Date("2026-01-01"), until: new Date("2026-01-31") },
    })

    expect(adsConversionService.getCtwaFunnel).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/ads/conversions/export", () => {
  const procedure = findProcedure("GET", "/v1/ads/conversions/export")

  test("uses listExportRows when allChannels is not set, and sets nextAfterId only on a full page", async () => {
    adsConversionService.listExportRows.mockResolvedValueOnce([
      { id: "row-1", occurredAt: new Date() },
    ])

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        since: new Date("2026-01-01"),
        until: new Date("2026-01-31"),
        segment: "leads",
        limit: 500,
      },
    })

    expect(adsConversionService.listExportRows).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
    expect(adsConversionService.listAllChannelExportRows).not.toHaveBeenCalled()
    // Short page (1 row < limit 500) -> no more pages.
    expect(result?.nextAfterId).toBeNull()
  })

  test("uses listAllChannelExportRows when allChannels is set", async () => {
    adsConversionService.listAllChannelExportRows.mockResolvedValueOnce([])

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        since: new Date("2026-01-01"),
        until: new Date("2026-01-31"),
        segment: "leads",
        allChannels: true,
        limit: 500,
      },
    })

    expect(adsConversionService.listAllChannelExportRows).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
    expect(adsConversionService.listExportRows).not.toHaveBeenCalled()
  })
})

describe("GET /v1/ads/{channel}/ad-accounts", () => {
  const procedure = findProcedure("GET", "/v1/ads/{channel}/ad-accounts")

  test("sources workspaceId from context and strips internal `sources` provenance", async () => {
    resolveChannelAdAccountSources.mockResolvedValueOnce([
      { id: "act_1", sources: [{ kind: "workspace" }] },
    ])

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { channel: "whatsapp" },
    })

    expect(resolveChannelAdAccountSources).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
    expect(result).toEqual({ data: [{ id: "act_1" }] })
  })
})
