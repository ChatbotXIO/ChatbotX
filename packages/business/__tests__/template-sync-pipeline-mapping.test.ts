// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listStages: vi.fn(),
  listFields: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  pipelineStageRepository: { listByPipeline: mocks.listStages },
  pipelineRepository: { listFields: mocks.listFields },
}))

const { rebuildPipelineChildMappings } = await import(
  "../src/template/sync-pipeline-mapping"
)

const makeCtx = (pipelines: Record<string, string>) => {
  const warnings: unknown[] = []
  return {
    ctx: {
      workspaceId: "ws-1",
      idMaps: { pipeline: new Map(Object.entries(pipelines)) } as Record<
        string,
        Map<string, string>
      >,
      warn: (warning: unknown) => warnings.push(warning),
    },
    warnings,
  }
}

const entry = {
  stages: [
    { sourceId: "s-a", name: "New" },
    { sourceId: "s-b", name: "Won" },
    { sourceId: "s-c", name: "Won" },
  ],
  fields: [
    { sourceId: "f-a", referenceName: "budget", type: "number" },
    { sourceId: "f-b", referenceName: "note", type: "text" },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listStages.mockResolvedValue([
    { id: "t-new", name: " new " },
    { id: "t-won-1", name: "Won" },
  ])
  mocks.listFields.mockResolvedValue([
    { id: "t-budget", referenceName: "budget", type: "number" },
    { id: "t-note", referenceName: "note", type: "number" },
  ])
})

describe("rebuildPipelineChildMappings", () => {
  test("maps stages by name (each target once) and fields by reference name and type", async () => {
    const { ctx, warnings } = makeCtx({ "src-p": "tgt-p" })

    await rebuildPipelineChildMappings(
      ctx as never,
      { "src-p": entry } as never,
      {} as never,
    )

    expect(mocks.listStages).toHaveBeenCalledWith(
      { workspaceId: "ws-1", pipelineId: "tgt-p" },
      expect.anything(),
    )
    expect([...ctx.idMaps.pipelineStage]).toEqual([
      ["s-a", "t-new"],
      ["s-b", "t-won-1"],
    ])
    expect([...ctx.idMaps.pipelineField]).toEqual([["f-a", "t-budget"]])
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "pipelineStage", value: "s-c" }),
      expect.objectContaining({ entityKind: "pipelineField", value: "f-b" }),
    ])
  })

  test("a pipeline that is not mapped yet is left to the manifest resolver", async () => {
    const { ctx } = makeCtx({})

    await rebuildPipelineChildMappings(
      ctx as never,
      { "src-p": entry } as never,
      {} as never,
    )

    expect(mocks.listStages).not.toHaveBeenCalled()
  })
})
