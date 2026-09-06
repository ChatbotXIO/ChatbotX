// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDelete } = vi.hoisted(() => ({
  mockDelete: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  sequenceService: { delete: mockDelete },
}))

const { deleteSequenceAction } = await import(
  "../src/features/sequences/actions/delete-sequence.action"
)

type ActionHandler = (args: {
  bindArgsParsedInputs: [string, string]
}) => Promise<unknown>

const callAction = deleteSequenceAction as unknown as ActionHandler

const WS = "ws-1"
const SEQ_ID = "seq-1"

describe("deleteSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockResolvedValue(undefined)
  })

  test("delegates to sequenceService.delete with workspaceId and id", async () => {
    await callAction({ bindArgsParsedInputs: [WS, SEQ_ID] })

    expect(mockDelete).toHaveBeenCalledWith({ workspaceId: WS, id: SEQ_ID })
  })

  test("propagates a not-found error from the service", async () => {
    mockDelete.mockRejectedValue(new Error("Sequence not found"))

    await expect(
      callAction({ bindArgsParsedInputs: [WS, SEQ_ID] }),
    ).rejects.toThrow("Sequence not found")
  })
})
