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
  description?: string
  tags: string[]
  successStatus?: number
  spec?: unknown
}

type CapturedProcedure = {
  input?: { safeParse: (value: unknown) => { success: boolean } }
  route: RouteConfig
  handler?: (args: { context: unknown; input: unknown }) => Promise<unknown>
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)
    const chain = {
      input: vi.fn((schema: CapturedProcedure["input"]) => {
        record.input = schema
        return chain
      }),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: CapturedProcedure["handler"]) => {
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

const find = vi.fn()
const list = vi.fn()
const getStats = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  facebookMarketingMessagesService: { find, list },
  facebookMarketingMessageDeliveryService: { getStats },
}))
vi.mock(
  "@/features/facebook-marketing-messages/lib/campaign-operations",
  () => ({
    createMarketingMessage: vi.fn(),
    updateMarketingMessage: vi.fn(),
    deleteMarketingMessages: vi.fn(),
    stopMarketingMessage: vi.fn(),
    resumeMarketingMessage: vi.fn(),
    sendMarketingMessage: vi.fn(),
  }),
)
vi.mock(
  "@/features/facebook-marketing-messages/lib/audience-operations",
  () => ({
    createAudience: vi.fn(),
    uploadMoreAudience: vi.fn(),
    deleteAudience: vi.fn(),
  }),
)
vi.mock("@/features/facebook-marketing-messages/lib/read-operations", () => ({
  listMarketingMessagesPages: vi.fn(),
  listMarketingMessagesAdAccounts: vi.fn(),
  listMarketingMessagesAudiences: vi.fn(),
  getMarketingMessagesAudiencesLiveStatus: vi.fn(),
}))
const getMarketingMessagesStatistics = vi.fn()
vi.mock(
  "@/features/facebook-marketing-messages/lib/statistics-operations",
  () => ({ getMarketingMessagesStatistics }),
)
vi.mock("@/features/facebook-marketing-messages/lib/delivery-errors", () => ({
  withMmDeliveryErrors: (fn: () => unknown) => Promise.resolve(fn()),
}))

await import("@/features/facebook-marketing-messages/api/public")

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

const context = { workspace: { id: "w1" } }
const campaignRow = {
  id: "1",
  name: "Promo",
  pageId: "p1",
  adAccountId: "act_1",
  currency: "USD",
  budgetType: "daily",
  budgetMinorUnits: 3000,
  content: { templateType: "text", text: "Hi" },
  targetType: "optIn",
  audienceId: null,
  campaignId: "meta-1",
  status: "sending",
  statusReason: null,
  statusErrorCode: null,
  statusErrorMessage: null,
  startsAt: new Date("2026-10-18T10:00:00Z"),
  startedAt: new Date("2026-10-18T10:00:05Z"),
  firstSentAt: new Date("2026-10-18T10:00:06Z"),
  completedAt: null,
  nextDayAt: null,
  tokenCount: 42,
  createdAt: new Date("2026-10-18T09:00:00Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers every procedure with scope ads and the expected paths", () => {
  expect(scopeArgAtImport).toBe("ads")
  const registered = capturedProcedures.map(
    (p) => `${p.route.method} ${p.route.path}`,
  )
  expect(registered.sort()).toEqual(
    [
      "GET /v1/marketing-messages/pages",
      "GET /v1/marketing-messages/ad-accounts",
      "GET /v1/marketing-messages/campaigns",
      "GET /v1/marketing-messages/campaigns/{id}",
      "POST /v1/marketing-messages/campaigns",
      "PUT /v1/marketing-messages/campaigns/{id}",
      "DELETE /v1/marketing-messages/campaigns/{id}",
      "POST /v1/marketing-messages/campaigns/{id}/stop",
      "POST /v1/marketing-messages/campaigns/{id}/resume",
      "POST /v1/marketing-messages/campaigns/{id}/send",
      "GET /v1/marketing-messages/audiences",
      "GET /v1/marketing-messages/audiences/live",
      "POST /v1/marketing-messages/audiences",
      "POST /v1/marketing-messages/audiences/{id}/rows",
      "DELETE /v1/marketing-messages/audiences/{id}",
      "GET /v1/marketing-messages/statistics",
    ].sort(),
  )
  for (const procedure of capturedProcedures) {
    expect(procedure.route.tags).toEqual(["Marketing Messages"])
    expect(procedure.route.description).toBeTruthy()
  }
  expect(
    findProcedure("POST", "/v1/marketing-messages/campaigns").route
      .successStatus,
  ).toBe(201)
})

test("campaigns.list includes the delivery status fields", async () => {
  list.mockResolvedValue([campaignRow])
  const result = (await findProcedure(
    "GET",
    "/v1/marketing-messages/campaigns",
  ).handler?.({ context, input: {} })) as { campaigns: unknown[] }

  expect(list).toHaveBeenCalledWith("w1")
  expect(result.campaigns[0]).toMatchObject({
    status: "sending",
    statusReason: null,
    startsAt: campaignRow.startsAt,
    firstSentAt: campaignRow.firstSentAt,
    tokenCount: 42,
  })
})

test("campaigns.get returns status, counts and errors from getStats", async () => {
  find.mockResolvedValue(campaignRow)
  getStats.mockResolvedValue({
    status: "sending",
    counts: { pending: 5, sent: 30, delivered: 20, failed: 2, unconfirmed: 1 },
    errors: [{ errorCode: 2_300_001, errorMessage: "Blocked", count: 2 }],
  })

  const result = (await findProcedure(
    "GET",
    "/v1/marketing-messages/campaigns/{id}",
  ).handler?.({ context, input: { id: "1" } })) as Record<string, unknown>

  expect(getStats).toHaveBeenCalledWith({ workspaceId: "w1", id: "1" })
  expect(result).toMatchObject({
    status: "sending",
    stats: {
      counts: {
        pending: 5,
        sent: 30,
        delivered: 20,
        failed: 2,
        unconfirmed: 1,
      },
      errors: [{ errorCode: 2_300_001, errorMessage: "Blocked", count: 2 }],
    },
  })
})

test("audiences.create rejects more than 100000 rows", () => {
  const procedure = findProcedure("POST", "/v1/marketing-messages/audiences")
  const base = {
    adAccountId: "act_1",
    pageId: "p1",
    name: "VIP",
    headers: ["email"],
  }

  expect(
    procedure.input?.safeParse({ ...base, rows: [["a@b.co"]] }).success,
  ).toBe(true)
  expect(
    procedure.input?.safeParse({
      ...base,
      rows: Array.from({ length: 100_001 }, () => ["a@b.co"]),
    }).success,
  ).toBe(false)
})

describe("statistics.get", () => {
  const route = () => findProcedure("GET", "/v1/marketing-messages/statistics")

  test("description names where ids come from, the default range and null metrics", () => {
    const description = route().route.description ?? ""
    expect(description).toContain("facebookMarketingMessages.adAccounts.list")
    expect(description).toContain("facebookMarketingMessages.campaigns.list")
    expect(description).toContain("last 30 days")
    expect(description).toContain("null")
    expect(description).toContain("aggregateUnavailable")
  })

  test("input rejects a malformed adAccountId and sort outside campaignId|name", () => {
    const input = route().input
    expect(input?.safeParse({ adAccountId: "123" }).success).toBe(false)
    expect(input?.safeParse({ sort: "spend" }).success).toBe(false)
    expect(
      input?.safeParse({ adAccountId: "act_1", sort: "name" }).success,
    ).toBe(true)
  })

  test("handler delegates to getMarketingMessagesStatistics with context.workspace and input", async () => {
    const result = { rows: [] }
    getMarketingMessagesStatistics.mockResolvedValue(result)
    const input = { adAccountId: "act_1", page: 1, perPage: 50 }

    await expect(route().handler?.({ context, input })).resolves.toBe(result)
    expect(getMarketingMessagesStatistics).toHaveBeenCalledWith(
      context.workspace,
      input,
    )
  })
})
