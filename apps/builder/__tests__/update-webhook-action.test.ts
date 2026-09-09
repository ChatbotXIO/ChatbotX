// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUpdateWithConditions } = vi.hoisted(() => ({
  mockUpdateWithConditions: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  webhookService: { updateWithConditions: mockUpdateWithConditions },
}))

vi.mock("../src/features/webhooks/schema/update-webhook-schema", () => ({
  updateWebhookRequest: {},
}))

const { updateWebhookAction } = await import(
  "../src/features/webhooks/actions/update-webhook-action"
)

type Condition = {
  id?: string
  type: string
  sourceId?: string | null
  operator?: string | null
  value?: unknown
}

type Handler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { url: string; conditions: Condition[] }
}) => Promise<unknown>

const callAction = updateWebhookAction as unknown as Handler

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateWithConditions.mockResolvedValue({
    id: "webhook-1",
    name: "New Order",
  })
})

describe("updateWebhookAction", () => {
  test("passes conditions through unmapped and delegates to webhookService.updateWithConditions", async () => {
    // `toConditionColumnsShared` inside the service now owns the column
    // normalization (`?? null` defaults) — the action forwards conditions
    // as-is instead of mapping them a second time.
    const conditions = [
      { id: "cond-1", type: "newContact" },
      { type: "tagApplied", sourceId: "tag-1" },
    ]

    const result = await callAction({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: {
        url: "https://example.com/hook",
        conditions,
      },
    })

    expect(mockUpdateWithConditions).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "webhook-1",
      url: "https://example.com/hook",
      conditions,
    })
    expect(result).toEqual({ id: "webhook-1", name: "New Order" })
  })

  test("returns undefined when the service reports no webhook", async () => {
    mockUpdateWithConditions.mockResolvedValue(undefined)

    const result = await callAction({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { url: "https://example.com/hook", conditions: [] },
    })

    expect(result).toBeUndefined()
  })
})
