// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  stages: vi.fn(),
  pipelines: vi.fn(),
  allStages: vi.fn(),
  fields: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      pipelineStageModel: { findMany: mocks.stages },
      pipelineFieldModel: { findMany: mocks.fields },
      pipelineModel: { findMany: mocks.pipelines },
    },
  },
}))

const { collectPipelineManifest } = await import(
  "../src/template/adapters/manifests/collect-pipelines"
)

const row = (type: string, sourceId: string | null, value: unknown = null) => ({
  type,
  sourceId,
  operator: null,
  value,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.stages.mockResolvedValue([])
  mocks.fields.mockResolvedValue([])
  mocks.pipelines.mockResolvedValue([])
})

describe("collectPipelineManifest with trigger conditions", () => {
  test("ships the pipeline a pipeline-item condition is pinned to, and the pipeline of its stage", async () => {
    mocks.stages.mockImplementation(
      async (args: { where: { id?: unknown } }) =>
        args.where.id ? [{ pipelineId: "27" }] : [],
    )

    await collectPipelineManifest(
      "ws-1",
      [],
      [
        row("pipelineItemCreated", "17"),
        row("pipelineItemMovedToStage", null, { stageId: "28" }),
      ],
    )

    const pipelineLookup = mocks.pipelines.mock.calls[0][0] as {
      where: { id: { in: string[] } }
    }
    expect(pipelineLookup.where.id.in.sort()).toEqual(["17", "27"])
    const stageLookup = mocks.stages.mock.calls[0][0] as {
      where: { id: { in: string[] } }
    }
    expect(stageLookup.where.id.in).toEqual(["28"])
  })

  test("conditions that name no pipeline add nothing", async () => {
    const manifest = await collectPipelineManifest(
      "ws-1",
      [],
      [row("tagApplied", "11"), row("newOrder", null)],
    )
    expect(manifest).toEqual({})
    expect(mocks.pipelines).not.toHaveBeenCalled()
  })
})
