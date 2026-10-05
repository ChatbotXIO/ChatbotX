import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: unknown[]) => unknown
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
      handler: vi.fn((fn: (...args: unknown[]) => unknown) => {
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

const notFound = Object.assign(new Error("not found"), { code: "notFound" })

const commentAutomationService = { findOrFail: vi.fn() }
const contactInboxService = { findManyByIds: vi.fn() }
vi.mock("@chatbotx.io/business", () => ({
  commentAutomationService,
  contactInboxService,
}))

const commentAutomationAnalyticsService = {
  getReplyStatsByDateRange: vi.fn(),
  listUserComments: vi.fn(),
  listBotReplies: vi.fn(),
  listErrors: vi.fn(),
  getContacts: vi.fn(),
}
vi.mock("@chatbotx.io/analytics", () => ({
  commentAutomationAnalyticsService,
}))

await import("@/features/analytics/api/public-comment-automation")

const findProcedure = (path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === "GET" &&
      procedure.route.path ===
        `/v1/analytics/comment-automations/{automationId}/${path}`,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "workspace-1" } }
const range = {
  automationId: "auto-1",
  from: "2026-09-01",
  to: "2026-10-01",
  timezone: "UTC",
}

beforeEach(() => {
  vi.clearAllMocks()
  commentAutomationService.findOrFail.mockResolvedValue({
    id: "auto-1",
    sentCount: 7,
  })
})

test("registers the routes under the analytics scope", () => {
  expect(scopeArgAtImport).toBe("analytics")
})

describe.each([
  ["replies", "getReplyStatsByDateRange", []],
  ["user-comments", "listUserComments", { data: [], total: 0 }],
  ["bot-replies", "listBotReplies", { data: [], total: 0 }],
  ["errors", "listErrors", { data: [], total: 0 }],
] as const)("GET .../%s", (path, method, response) => {
  test("maps from/to and injects the token workspace", async () => {
    commentAutomationAnalyticsService[method].mockResolvedValueOnce(response)

    await findProcedure(path).handler?.({
      context,
      input: { ...range, page: 1, perPage: 20 },
    })

    expect(commentAutomationAnalyticsService[method]).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        automationId: "auto-1",
        startDate: "2026-09-01",
        endDate: "2026-10-01",
      }),
    )
  })

  test("404s for an automation outside the workspace", async () => {
    commentAutomationService.findOrFail.mockRejectedValueOnce(notFound)

    await expect(
      findProcedure(path).handler?.({ context, input: range }),
    ).rejects.toBe(notFound)
    expect(commentAutomationAnalyticsService[method]).not.toHaveBeenCalled()
  })
})

test("errors drop the commenter's name and avatar", async () => {
  commentAutomationAnalyticsService.listErrors.mockResolvedValueOnce({
    data: [
      {
        id: "e-1",
        errorDetail: "boom",
        contact: { firstName: "A", lastName: "B", avatar: null },
      },
    ],
    total: 1,
    page: 1,
    pageCount: 1,
  })

  const result = (await findProcedure("errors").handler?.({
    context,
    input: range,
  })) as { data: Record<string, unknown>[] }

  expect(result.data[0]).toEqual({ id: "e-1", errorDetail: "boom" })
})

test("contacts reads the total from the automation's counter and drops PII", async () => {
  commentAutomationAnalyticsService.getContacts.mockResolvedValueOnce({
    contactInboxIds: ["ci-1"],
    events: [
      {
        rowKey: "ev-1",
        contactInboxId: "ci-1",
        occurredAt: "2026-09-02T00:00:00Z",
      },
    ],
    contactTotal: 1,
  })
  contactInboxService.findManyByIds.mockResolvedValueOnce([
    {
      id: "ci-1",
      contactId: "c-1",
      sourceId: "psid-1",
      channel: "messenger",
      conversation: { id: "conv-1" },
      contact: { firstName: "A", lastName: "B", fullName: "A B", avatar: "x" },
    },
  ])

  const result = (await findProcedure("contacts").handler?.({
    context,
    input: {
      automationId: "auto-1",
      eventType: "message:sent",
      page: 1,
      perPage: 20,
    },
  })) as { total: number; data: Record<string, unknown>[] }

  expect(result.total).toBe(7)
  expect(result.data[0]).toMatchObject({
    contactId: "c-1",
    conversationId: "conv-1",
  })
  for (const key of ["firstName", "lastName", "fullName", "avatar"]) {
    expect(result.data[0]).not.toHaveProperty(key)
  }
  expect(contactInboxService.findManyByIds).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
    ids: ["ci-1"],
  })
})
