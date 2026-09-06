// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDeleteMany } = vi.hoisted(() => ({
  mockDeleteMany: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  webhookService: { deleteMany: mockDeleteMany },
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

const callAction = deleteWebhooksAction as unknown as Handler

beforeEach(() => {
  vi.clearAllMocks()
  mockDeleteMany.mockResolvedValue(undefined)
})

describe("deleteWebhooksAction", () => {
  test("delegates to webhookService.deleteMany with workspaceId and ids", async () => {
    await callAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["webhook-1", "webhook-2"] },
    })

    expect(mockDeleteMany).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["webhook-1", "webhook-2"],
    })
  })
})
