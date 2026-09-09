// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// `@chatbotx.io/analytics`'s barrel re-exports its services, which import
// repositories that open a real `pg.Pool` via `@chatbotx.io/database/client`
// at module load. The service mock below replaces the service objects, but
// importing the real `@chatbotx.io/analytics` module (transitively, via any
// path not covered by the mock) still runs that side effect — stub the
// client the same way `public-spec-operations.test.ts` does.
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
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

const contactAnalyticsService = {
  getContactCountsPerDay: vi.fn(),
  getNewContactsPerDay: vi.fn(),
  getBlockedContactsPerDay: vi.fn(),
  getBlockedContactsCount: vi.fn(),
  getNewContactsCount: vi.fn(),
  getContactsCount: vi.fn(),
  getContactsByCountry: vi.fn(),
  getContactsByChannel: vi.fn(),
  getContactsBySource: vi.fn(),
}

const macAnalyticsService = {
  getActiveContactsByWorkspaceForRange: vi.fn(),
  getActiveContactCountByWorkspaceId: vi.fn(),
}

const messageAnalyticsService = {
  getMessagesByAdmin: vi.fn(),
  getHumanAgentStats: vi.fn(),
  getMessagesBySender: vi.fn(),
}

const conversationAnalyticsService = {
  getHandoffsByDay: vi.fn(),
  getFollowUpsByDay: vi.fn(),
  getArchivedByDay: vi.fn(),
  getAssignedByDay: vi.fn(),
  getAssignedByAdmin: vi.fn(),
  getUniqueConversationsByAdmin: vi.fn(),
}

const botMessageAnalyticsService = {
  getMessagesByResult: vi.fn(),
  getMessagesWithResponse: vi.fn(),
  getMessagesWithNoResponse: vi.fn(),
  getAIProviderStats: vi.fn(),
}

const broadcastAnalyticsService = {
  getStats: vi.fn(),
}

const sequenceAnalyticsService = {
  getStepStats: vi.fn(),
}

const flowAnalyticsService = {
  getFlowStats: vi.fn(),
  resetStatsSession: vi.fn(),
}

const magicLinkAnalyticsService = {
  getMagicLinkStatsByDateRange: vi.fn(),
  getMagicLinkContactStats: vi.fn(),
}

const refLinkAnalyticsService = {
  getRefLinkStatsByDateRange: vi.fn(),
  getRefLinkContactStats: vi.fn(),
}

vi.mock("@chatbotx.io/analytics", () => ({
  contactAnalyticsService,
  macAnalyticsService,
  messageAnalyticsService,
  conversationAnalyticsService,
  botMessageAnalyticsService,
  broadcastAnalyticsService,
  sequenceAnalyticsService,
  flowAnalyticsService,
  magicLinkAnalyticsService,
  refLinkAnalyticsService,
}))

const withCache = vi.fn((_key: string, loader: () => unknown) => loader())
const invalidateCacheByTags = vi.fn()

vi.mock("@chatbotx.io/redis", () => ({ withCache, invalidateCacheByTags }))

await import("@/features/analytics/api/public")

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
  withCache.mockImplementation((_key: string, loader: () => unknown) =>
    loader(),
  )
})

test("registers the analytics public router under the analytics scope", () => {
  expect(scopeArgAtImport).toBe("analytics")
})

describe("GET /v1/analytics/contact-counts-per-day", () => {
  const procedure = findProcedure("GET", "/v1/analytics/contact-counts-per-day")

  test("sources workspaceId from context, not input", async () => {
    contactAnalyticsService.getContactCountsPerDay.mockResolvedValueOnce([])

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { from: new Date(), to: new Date(), timezone: "UTC" },
    })

    expect(contactAnalyticsService.getContactCountsPerDay).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/analytics/contacts-count", () => {
  const procedure = findProcedure("GET", "/v1/analytics/contacts-count")

  test("sources workspaceId from context and uses the cache", async () => {
    contactAnalyticsService.getContactsCount.mockResolvedValueOnce(5)

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { from: new Date(), to: new Date(), timezone: "UTC" },
    })

    expect(contactAnalyticsService.getContactsCount).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
    expect(withCache).toHaveBeenCalled()
    expect(result).toEqual({ data: { count: 5 } })
  })
})

describe("GET /v1/analytics/conversation-handoffs", () => {
  const procedure = findProcedure("GET", "/v1/analytics/conversation-handoffs")

  test("sources workspaceId from context, not input", async () => {
    conversationAnalyticsService.getHandoffsByDay.mockResolvedValueOnce([])

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { from: new Date(), to: new Date(), timezone: "UTC" },
    })

    expect(conversationAnalyticsService.getHandoffsByDay).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/analytics/bot-messages-by-result", () => {
  const procedure = findProcedure("GET", "/v1/analytics/bot-messages-by-result")

  test("sources workspaceId from context, not input", async () => {
    botMessageAnalyticsService.getMessagesByResult.mockResolvedValueOnce([])

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        from: new Date(),
        to: new Date(),
        timezone: "UTC",
        granularity: "day",
      },
    })

    expect(botMessageAnalyticsService.getMessagesByResult).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/analytics/broadcasts/{broadcastId}/stats", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/analytics/broadcasts/{broadcastId}/stats",
  )

  test("sources workspaceId from context and caches by workspace+broadcast", async () => {
    broadcastAnalyticsService.getStats.mockResolvedValueOnce({
      "message:sent": 1,
      "message:delivered": 1,
      "message:seen": 0,
      "flow:clicked": 0,
      "message:failed": 0,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { broadcastId: "b-1" },
    })

    expect(broadcastAnalyticsService.getStats).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      broadcastId: "b-1",
    })
    expect(withCache).toHaveBeenCalledWith(
      "analytics:broadcast-stats:workspace-1:b-1",
      expect.any(Function),
      { ttl: 120 },
    )
  })
})

describe("GET /v1/analytics/sequences/{sequenceId}/steps/{stepId}/stats", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/analytics/sequences/{sequenceId}/steps/{stepId}/stats",
  )

  test("sources workspaceId from context", async () => {
    sequenceAnalyticsService.getStepStats.mockResolvedValueOnce({
      "message:sent": 1,
      "message:delivered": 1,
      "message:seen": 0,
      "flow:clicked": 0,
      "message:failed": 0,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { sequenceId: "s-1", stepId: "step-1" },
    })

    expect(sequenceAnalyticsService.getStepStats).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sequenceId: "s-1",
      stepId: "step-1",
    })
  })
})

describe("GET /v1/analytics/mac/active-count", () => {
  const procedure = findProcedure("GET", "/v1/analytics/mac/active-count")

  test("sources workspaceId from context", async () => {
    macAnalyticsService.getActiveContactCountByWorkspaceId.mockResolvedValueOnce(
      7,
    )

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {},
    })

    expect(
      macAnalyticsService.getActiveContactCountByWorkspaceId,
    ).toHaveBeenCalledWith({ workspaceId: "workspace-1" })
    expect(result).toEqual({ data: { macCount: 7 } })
  })
})

describe("GET /v1/analytics/flows/{flowId}", () => {
  const procedure = findProcedure("GET", "/v1/analytics/flows/{flowId}")

  test("sources workspaceId from context and caches by workspace+flow", async () => {
    flowAnalyticsService.getFlowStats.mockResolvedValueOnce({})

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { flowId: "flow-1" },
    })

    expect(flowAnalyticsService.getFlowStats).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      flowId: "flow-1",
    })
    expect(withCache).toHaveBeenCalledWith(
      "flow:stats:workspace-1:flow-1",
      expect.any(Function),
      { ttl: 120, tags: ["flow-stats:flow-1"] },
    )
  })
})

describe("DELETE /v1/analytics/flows/{flowId}", () => {
  const procedure = findProcedure("DELETE", "/v1/analytics/flows/{flowId}")

  test("resets stats session scoped to context workspace and invalidates cache tags", async () => {
    flowAnalyticsService.resetStatsSession.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { flowId: "flow-1" },
    })

    expect(flowAnalyticsService.resetStatsSession).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      flowId: "flow-1",
    })
    expect(invalidateCacheByTags).toHaveBeenCalledWith(["flow-stats:flow-1"])
  })
})

describe("GET /v1/analytics/magic-links/stats", () => {
  const procedure = findProcedure("GET", "/v1/analytics/magic-links/stats")

  test("sources workspaceId from context", async () => {
    magicLinkAnalyticsService.getMagicLinkStatsByDateRange.mockResolvedValueOnce(
      [],
    )

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        linkId: "link-1",
        timezone: "UTC",
      },
    })

    expect(
      magicLinkAnalyticsService.getMagicLinkStatsByDateRange,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/analytics/magic-links/contacts", () => {
  const procedure = findProcedure("GET", "/v1/analytics/magic-links/contacts")

  test("trims PII fields (firstName/lastName/avatar) from the response", async () => {
    magicLinkAnalyticsService.getMagicLinkContactStats.mockResolvedValueOnce({
      data: [
        {
          contactId: "c-1",
          contactInboxId: "ci-1",
          firstName: "Jane",
          lastName: "Doe",
          sourceId: "src-1",
          avatar: "https://example.com/avatar.png",
          channel: "messenger",
          conversationId: "conv-1",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageCount: 1,
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { linkId: "link-1", page: 1, perPage: 50 },
    })

    expect(
      magicLinkAnalyticsService.getMagicLinkContactStats,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
    expect(result.data).toEqual([
      {
        contactId: "c-1",
        contactInboxId: "ci-1",
        sourceId: "src-1",
        channel: "messenger",
        conversationId: "conv-1",
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
    ])
    expect(result.data[0]).not.toHaveProperty("firstName")
    expect(result.data[0]).not.toHaveProperty("lastName")
    expect(result.data[0]).not.toHaveProperty("avatar")
  })
})

describe("GET /v1/analytics/ref-links/stats", () => {
  const procedure = findProcedure("GET", "/v1/analytics/ref-links/stats")

  test("sources workspaceId from context", async () => {
    refLinkAnalyticsService.getRefLinkStatsByDateRange.mockResolvedValueOnce([])

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        linkId: "link-1",
        timezone: "UTC",
      },
    })

    expect(
      refLinkAnalyticsService.getRefLinkStatsByDateRange,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/analytics/ref-links/contacts", () => {
  const procedure = findProcedure("GET", "/v1/analytics/ref-links/contacts")

  test("trims PII fields from the response", async () => {
    refLinkAnalyticsService.getRefLinkContactStats.mockResolvedValueOnce({
      data: [
        {
          contactId: "c-2",
          contactInboxId: "ci-2",
          firstName: "John",
          lastName: "Smith",
          sourceId: "src-2",
          avatar: "https://example.com/avatar2.png",
          channel: "whatsapp",
          conversationId: "conv-2",
          occurredAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageCount: 1,
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { linkId: "link-2", page: 1, perPage: 50 },
    })

    expect(result.data[0]).not.toHaveProperty("firstName")
    expect(result.data[0]).not.toHaveProperty("lastName")
    expect(result.data[0]).not.toHaveProperty("avatar")
  })
})
