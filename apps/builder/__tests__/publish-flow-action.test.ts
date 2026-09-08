// @vitest-environment node

import { sendMessageNodeDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockPublish } = vi.hoisted(() => ({
  mockPublish: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  flowVersionService: { publish: mockPublish },
}))

const { publishFlowAction } = await import(
  "../src/features/flows/actions/publish-flow-action"
)

type ActionHandler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { nodes: unknown[]; edges: unknown[] }
}) => Promise<unknown>

const callAction = publishFlowAction as unknown as ActionHandler

describe("publishFlowAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates to flowVersionService.publish with workspaceId, flowId, nodes, edges", async () => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: { id: "2", position: { x: 0, y: 0 } },
      dataProps: { name: "Canvas", isStartNode: true },
      detailProps: {
        beforeStep: {
          id: "12",
          stepType: "chooseChannel",
          channel: "omnichannel",
        },
      },
    })

    await callAction({
      bindArgsParsedInputs: ["1", "10"],
      parsedInput: { nodes: [node], edges: [] },
    })

    expect(mockPublish).toHaveBeenCalledWith({
      workspaceId: "1",
      flowId: "10",
      nodes: [node],
      edges: [],
    })
  })

  test("propagates errors thrown by the service (e.g. flow not found)", async () => {
    mockPublish.mockRejectedValueOnce(new Error("Flow not found"))

    await expect(
      callAction({
        bindArgsParsedInputs: ["1", "10"],
        parsedInput: { nodes: [], edges: [] },
      }),
    ).rejects.toThrow("Flow not found")
  })
})
