// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUpdateSettings } = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  webhookService: { updateSettings: mockUpdateSettings },
}))

vi.mock("../src/features/webhooks/schema/update-webhook-schema", () => ({
  updateWebhookSettingsRequest: {},
}))

const { updateWebhookSettingsAction } = await import(
  "../src/features/webhooks/actions/update-webhook-settings-action"
)

type Handler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { active?: boolean; name?: string }
}) => Promise<unknown>

const callAction = updateWebhookSettingsAction as unknown as Handler

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateSettings.mockResolvedValue(undefined)
})

describe("updateWebhookSettingsAction", () => {
  test("delegates to webhookService.updateSettings with workspaceId, id, and the patch", async () => {
    await callAction({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { active: true },
    })

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "webhook-1",
      active: true,
    })
  })

  test("propagates a not-found error from the service", async () => {
    mockUpdateSettings.mockRejectedValue(new Error("Webhook not found"))

    await expect(
      callAction({
        bindArgsParsedInputs: ["ws-1", "missing"],
        parsedInput: { active: true },
      }),
    ).rejects.toThrow("Webhook not found")
  })
})
