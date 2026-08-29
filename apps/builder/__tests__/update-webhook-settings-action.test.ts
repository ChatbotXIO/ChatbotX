// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindFirst,
  mockUpdateReturning,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockUpdateWebhookCache,
  mockRecordAuditLog,
} = vi.hoisted(() => {
  const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: "webhook-1" }])
  const mockUpdateWhere = vi.fn().mockReturnValue({
    returning: mockUpdateReturning,
  })
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })
  return {
    mockFindFirst: vi.fn(),
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
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

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { webhookModel: { findFirst: mockFindFirst } },
    update: mockUpdate,
  },
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  webhookModel: { id: "id" },
}))

vi.mock("@chatbotx.io/events", () => ({
  updateWebhookCache: mockUpdateWebhookCache,
}))

vi.mock("../src/features/webhooks/schemas/update-webhook-schema", () => ({
  updateWebhookSettingsRequest: {},
}))

const { updateWebhookSettingsAction } = await import(
  "../src/features/webhooks/actions/update-webhook-settings-action"
)

type Handler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { active?: boolean; name?: string }
}) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdate.mockReturnValue({ set: mockUpdateSet })
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
  mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning })
  mockUpdateReturning.mockResolvedValue([{ id: "webhook-1" }])
  mockFindFirst.mockResolvedValue({
    id: "webhook-1",
    name: "New Order",
    active: false,
  })
})

describe("updateWebhookSettingsAction", () => {
  test("skips update, cache, and audit when active is unchanged", async () => {
    await (updateWebhookSettingsAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { active: false },
    })

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockUpdateWebhookCache).not.toHaveBeenCalled()
    expect(mockRecordAuditLog).not.toHaveBeenCalled()
  })

  test("emits an 'enabled' detail when active flips to true", async () => {
    await (updateWebhookSettingsAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { active: true },
    })

    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "update",
      detail: "enabled a webhook (#webhook-1)",
    })
  })

  test("emits a generic update detail when the name changes", async () => {
    await (updateWebhookSettingsAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { name: "Orders" },
    })

    expect(mockUpdateSet).toHaveBeenCalledWith({ name: "Orders" })
    expect(mockUpdateReturning).toHaveBeenCalledWith({ id: "id" })
    expect(mockUpdateWebhookCache).toHaveBeenCalledWith("ws-1")
    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "update",
      detail: "updated a webhook (#webhook-1)",
    })
  })

  test("skips cache and audit when the update races a concurrent delete", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await (updateWebhookSettingsAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { active: true },
    })

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockUpdateWebhookCache).not.toHaveBeenCalled()
    expect(mockRecordAuditLog).not.toHaveBeenCalled()
  })

  test("emits a 'disabled' detail when active flips to false", async () => {
    mockFindFirst.mockResolvedValue({
      id: "webhook-1",
      name: "New Order",
      active: true,
    })

    await (updateWebhookSettingsAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { active: false },
    })

    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "update",
      detail: "disabled a webhook (#webhook-1)",
    })
  })

  test("throws when the webhook is not found", async () => {
    mockFindFirst.mockResolvedValue(undefined)

    await expect(
      (updateWebhookSettingsAction as unknown as Handler)({
        bindArgsParsedInputs: ["ws-1", "missing"],
        parsedInput: { active: true },
      }),
    ).rejects.toThrow("Webhook not found")

    expect(mockRecordAuditLog).not.toHaveBeenCalled()
  })
})
