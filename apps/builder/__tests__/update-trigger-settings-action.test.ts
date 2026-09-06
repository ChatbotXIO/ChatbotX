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
  triggerService: { updateSettings: mockUpdateSettings },
}))

const { updateTriggerSettingsAction } = await import(
  "../src/features/triggers/actions/update-trigger-settings-action"
)

type Handler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { name?: string; active?: boolean }
}) => Promise<unknown>

const callAction = updateTriggerSettingsAction as unknown as Handler

describe("updateTriggerSettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateSettings.mockResolvedValue(undefined)
  })

  test("delegates to triggerService.updateSettings with workspaceId, id, and the patch", async () => {
    await callAction({
      bindArgsParsedInputs: ["workspace-1", "trigger-1"],
      parsedInput: { active: true },
    })

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "trigger-1",
      active: true,
    })
  })

  test("propagates a not-found error from the service", async () => {
    mockUpdateSettings.mockRejectedValue(new Error("Trigger not found"))

    await expect(
      callAction({
        bindArgsParsedInputs: ["workspace-1", "trigger-1"],
        parsedInput: { name: "New name" },
      }),
    ).rejects.toThrow("Trigger not found")
  })
})
