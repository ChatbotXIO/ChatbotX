// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUpdate, mockUpdateSettings } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockUpdateSettings: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return {
    workspaceActionClient: chain,
    workspaceActionClientAllowScheduledDeletion: chain,
  }
})

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { update: mockUpdate, updateSettings: mockUpdateSettings },
}))

vi.mock("@/features/common/schema", () => ({ workspaceIdrequestParams: [] }))

const { updateWorkspaceAdvancedAction, updateSmartResponseDelayAction } =
  await import("../src/features/workspaces/actions/update-workspace-action")

type ActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: Record<string, unknown>
}) => Promise<unknown>

const advanced = updateWorkspaceAdvancedAction as unknown as ActionHandler
const delay = updateSmartResponseDelayAction as unknown as ActionHandler

const advancedInput = {
  defaultReply: "flow-1",
  targetCountry: "VN",
  language: "vi",
  timezone: "Asia/Ho_Chi_Minh",
  brandColor: "#016DFF",
  developmentMode: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("workspace settings actions use the same service method as the public API", () => {
  test("advanced settings go through updateSettings", async () => {
    await advanced({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: advancedInput,
    })

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      id: "ws-1",
      data: advancedInput,
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('an empty Default Reply from the form clears it instead of looking up flow ""', async () => {
    await advanced({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ...advancedInput, defaultReply: "" },
    })

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      id: "ws-1",
      data: { ...advancedInput, defaultReply: null },
    })
  })

  test("the bot reply delay goes through updateSettings", async () => {
    await delay({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { smartResponseDelaySeconds: 30 },
    })

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      id: "ws-1",
      data: { smartResponseDelaySeconds: 30 },
    })
  })
})
