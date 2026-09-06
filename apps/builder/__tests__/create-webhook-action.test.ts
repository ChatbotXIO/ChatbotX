// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockInsertReturning,
  mockInsertValues,
  mockInsert,
  mockCount,
  mockGetTranslations,
  mockCreateId,
  mockUpdateWebhookCache,
  mockRecordAuditLog,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn()
  mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
  const mockInsert = vi.fn()
  mockInsert.mockReturnValue({ values: mockInsertValues })

  return {
    mockInsertReturning,
    mockInsertValues,
    mockInsert,
    mockCount: vi.fn().mockResolvedValue(0),
    mockGetTranslations: vi.fn().mockResolvedValue((k: string) => k),
    mockCreateId: vi.fn().mockReturnValue("webhook-1"),
    mockUpdateWebhookCache: vi.fn().mockResolvedValue(undefined),
    mockRecordAuditLog: vi.fn(),
  }
})

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

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { insert: mockInsert, $count: mockCount },
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  webhookModel: { workspaceId: "workspaceId" },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  folderTypes: { enum: { webhook: "webhook" } },
}))

vi.mock("@chatbotx.io/events", () => ({
  updateWebhookCache: mockUpdateWebhookCache,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: mockCreateId }
})

vi.mock("next-intl/server", () => ({
  getTranslations: mockGetTranslations,
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@chatbotx.io/business", () => ({
  folderService: { ensureExists: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock("../src/features/webhooks/schema/create-webhook-schema", () => ({
  createWebhookSchema: {},
}))

vi.mock("../src/features/webhooks/constants", () => ({
  MAX_WEBHOOKS_PER_CHATBOT: 100,
}))

const { createWebhookAction } = await import(
  "../src/features/webhooks/actions/create-webhook-action"
)

type Handler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { name: string; folderId?: string | null }
}) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
  mockInsert.mockReturnValue({ values: mockInsertValues })
  mockCount.mockResolvedValue(0)
})

describe("createWebhookAction", () => {
  test("emits a create audit row with the webhook name and id", async () => {
    mockInsertReturning.mockResolvedValue([
      { id: "webhook-1", name: "New Order" },
    ])

    const result = await (createWebhookAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { name: "New Order", folderId: null },
    })

    expect(result).toEqual({ id: "webhook-1", name: "New Order" })
    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "create",
      detail: "created a new webhook (#webhook-1)",
    })
  })
})
