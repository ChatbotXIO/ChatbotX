// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDbTransaction, mockUpdateWebhookCache, mockRecordAuditLog } =
  vi.hoisted(() => ({
    mockDbTransaction: vi.fn(),
    mockUpdateWebhookCache: vi.fn().mockResolvedValue(undefined),
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
  db: { transaction: mockDbTransaction },
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  webhookModel: { id: "id", workspaceId: "workspaceId" },
  conditionModel: { id: "id" },
}))

vi.mock("@chatbotx.io/events", () => ({
  updateWebhookCache: mockUpdateWebhookCache,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "generated-id" }
})

vi.mock("@/features/conditions/to-condition-columns", () => ({
  toConditionColumns: (c: unknown) => c,
}))

vi.mock("../src/features/webhooks/schema/update-webhook-schema", () => ({
  updateWebhookRequest: {},
}))

const { updateWebhookAction } = await import(
  "../src/features/webhooks/actions/update-webhook-action"
)

type Handler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { url: string; conditions: unknown[] }
}) => Promise<unknown>

const tx = {
  query: {
    conditionModel: { findMany: vi.fn().mockResolvedValue([]) },
    webhookModel: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "webhook-1", name: "New Order" }),
    },
  },
  update: vi.fn().mockReturnValue({
    set: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }),
  delete: vi
    .fn()
    .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  insert: vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDbTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  )
  tx.query.conditionModel.findMany.mockResolvedValue([])
  tx.query.webhookModel.findFirst.mockResolvedValue({
    id: "webhook-1",
    name: "New Order",
  })
})

describe("updateWebhookAction", () => {
  test("emits an update audit row with the webhook name and id", async () => {
    const result = await (updateWebhookAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { url: "https://example.com/hook", conditions: [] },
    })

    expect(result).toEqual({ id: "webhook-1", name: "New Order" })
    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "update",
      detail: "updated a webhook (#webhook-1)",
    })
  })

  test("does not emit when the webhook row is gone after the transaction", async () => {
    tx.query.webhookModel.findFirst.mockResolvedValue(undefined)

    await (updateWebhookAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { url: "https://example.com/hook", conditions: [] },
    })

    expect(mockRecordAuditLog).not.toHaveBeenCalled()
  })
})
