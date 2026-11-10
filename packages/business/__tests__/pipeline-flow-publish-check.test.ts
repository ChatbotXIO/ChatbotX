// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockListFieldsByPipelineIds } = vi.hoisted(() => ({
  mockListFieldsByPipelineIds: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  pipelineRepository: {
    listFieldsByPipelineIds: (...args: unknown[]) =>
      mockListFieldsByPipelineIds(...args),
  },
}))

const { pipelineStepDefaultFn } = await import("@chatbotx.io/flow-config")
const { assertFlowPipelineStepsPublishable } = await import(
  "../src/pipeline/flow-publish-check"
)

const addToPipeline = (
  pipelineId: string,
  fieldValues: { pipelineFieldId: string; value: string }[],
) => ({
  ...pipelineStepDefaultFn("addToPipeline", { pipelineId }),
  fieldValues,
})

const node = (name: string, steps: unknown[]) => ({
  id: "n1",
  data: { name, details: { steps } },
})

beforeEach(() => {
  mockListFieldsByPipelineIds.mockReset()
  mockListFieldsByPipelineIds.mockResolvedValue([
    { id: "10", pipelineId: "1", name: "Budget", required: true },
    { id: "11", pipelineId: "1", name: "Notes", required: false },
    { id: "20", pipelineId: "2", name: "Company", required: true },
  ])
})

describe("assertFlowPipelineStepsPublishable", () => {
  test("rejects an Add to pipeline step that leaves a required field empty, naming the node and field", async () => {
    await expect(
      assertFlowPipelineStepsPublishable({
        workspaceId: "ws-1",
        nodes: [node("Qualify lead", [addToPipeline("1", [])])] as never,
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "nodes",
      message: expect.stringContaining('"Qualify lead": Budget'),
    })
  })

  test("only checks the fields of the step's own pipeline", async () => {
    await expect(
      assertFlowPipelineStepsPublishable({
        workspaceId: "ws-1",
        nodes: [
          node("Qualify lead", [
            addToPipeline("1", [{ pipelineFieldId: "10", value: "500" }]),
          ]),
        ] as never,
      }),
    ).resolves.toBeUndefined()
  })

  test("reports every failing step in one error and loads fields once", async () => {
    const error = await assertFlowPipelineStepsPublishable({
      workspaceId: "ws-1",
      nodes: [
        node("Node A", [addToPipeline("1", [])]),
        node("Node B", [addToPipeline("2", [])]),
      ] as never,
    }).catch((caught: Error) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('"Node A": Budget')
    expect((error as Error).message).toContain('"Node B": Company')
    expect(mockListFieldsByPipelineIds).toHaveBeenCalledTimes(1)
    expect(mockListFieldsByPipelineIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      pipelineIds: ["1", "2"],
    })
  })

  test("a {{variable}} value is accepted", async () => {
    await expect(
      assertFlowPipelineStepsPublishable({
        workspaceId: "ws-1",
        nodes: [
          node("Qualify lead", [
            addToPipeline("1", [
              { pipelineFieldId: "10", value: "{{budget}}" },
            ]),
          ]),
        ] as never,
      }),
    ).resolves.toBeUndefined()
  })

  test("ignores other pipeline actions and flows without pipeline steps, without a query", async () => {
    await assertFlowPipelineStepsPublishable({
      workspaceId: "ws-1",
      nodes: [
        node("Move", [
          pipelineStepDefaultFn("moveToStage", { pipelineId: "1" }),
        ]),
        node("Text", [{ stepType: "sendText", text: "hi" }]),
        { id: "start", data: {} },
      ] as never,
    })

    expect(mockListFieldsByPipelineIds).not.toHaveBeenCalled()
  })

  test("a deleted pipeline (no fields returned) does not block publish", async () => {
    mockListFieldsByPipelineIds.mockResolvedValue([])

    await expect(
      assertFlowPipelineStepsPublishable({
        workspaceId: "ws-1",
        nodes: [node("Gone", [addToPipeline("9", [])])] as never,
      }),
    ).resolves.toBeUndefined()
  })
})
