// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindMany, mockDelete, mockRemoveWebhookCache, mockRecordAuditLog } =
  vi.hoisted(() => ({
    mockFindMany: vi.fn(),
    mockDelete: vi.fn(),
    mockRemoveWebhookCache: vi.fn().mockResolvedValue(undefined),
    mockRecordAuditLog: vi.fn(),
  }))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: (...args: unknown[]) => mockRecordAuditLog(...args) },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { webhookModel: { findMany: mockFindMany } },
    delete: mockDelete,
  },
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  webhookModel: { id: "id", workspaceId: "workspaceId" },
}))

vi.mock("@chatbotx.io/events", () => ({
  removeWebhookCache: mockRemoveWebhookCache,
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
  bulkUpdateIdsRequest: {},
}))

const { deleteWebhooksAction } = await import(
  "../src/features/webhooks/actions/delete-webhooks-action"
)

type Handler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { ids: string[] }
}) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
})

describe("deleteWebhooksAction", () => {
  test("emits one delete audit row listing every deleted webhook", async () => {
    mockFindMany.mockResolvedValue([
      { id: "webhook-1", name: "New Order" },
      { id: "webhook-2", name: "Refund Issued" },
    ])

    await (deleteWebhooksAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["webhook-1", "webhook-2"] },
    })

    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "delete",
      detail: "deleted webhooks (#webhook-1, #webhook-2)",
    })
  })

  test("emits no audit row when nothing matched", async () => {
    mockFindMany.mockResolvedValue([])

    await (deleteWebhooksAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["missing"] },
    })

    expect(mockRecordAuditLog).not.toHaveBeenCalled()
  })
})
