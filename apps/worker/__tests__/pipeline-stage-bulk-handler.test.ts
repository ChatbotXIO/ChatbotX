import { beforeEach, describe, expect, test, vi } from "vitest"

const releaseClaim = vi.fn()
const processQueued = vi.fn()
vi.mock("@chatbotx.io/business/pipeline", () => ({
  pipelineStageBulkService: { releaseClaim, processQueued },
}))

const { processPipelineStageBulk, releasePipelineStageBulkClaim } =
  await import("../src/default/handlers/pipeline-stage-bulk")

const data = {
  workspaceId: "1",
  pipelineId: "2",
  stageId: "3",
  bulkJobId: "pipeline-stage-bulk-3-1",
  moveItemsToStageId: null,
  actorUserId: null,
  actorKind: "user" as const,
  actorSourceId: null,
}

describe("pipeline stage bulk handler", () => {
  beforeEach(() => vi.clearAllMocks())

  test("the job forwards its claim id to the service", async () => {
    await processPipelineStageBulk(data)
    expect(processQueued).toHaveBeenCalledWith(data)
  })

  test("a blocked owner releases the job's own claim instead of leaving the stage busy", async () => {
    await releasePipelineStageBulkClaim(data)
    expect(releaseClaim).toHaveBeenCalledWith(data)
    expect(processQueued).not.toHaveBeenCalled()
  })
})
