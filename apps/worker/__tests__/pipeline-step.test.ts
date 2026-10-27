import { beforeEach, describe, expect, test, vi } from "vitest"

// Covers the "Pipelines" flow step handler (`handlePipelineStep`). The 14
// actions' business rules are tested with `runPipelineFlowAction` in
// packages/business/__tests__/pipeline-flow-actions.test.ts.

const runPipelineFlowAction = vi.fn()

vi.mock("@chatbotx.io/business/pipeline", () => ({ runPipelineFlowAction }))

const getAll = vi.fn(async () => ({ name: "Ada" }))
const replaceAll = vi.fn(
  async ({ text, variables }: { text: string; variables: { name: string } }) =>
    text.replace("{{name}}", variables.name),
)
vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll, replaceAll },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { handlePipelineStep } = await import(
  "../src/integration/handlers/pipeline"
)
const { pipelineStepActions, pipelineStepDefaultFn } = await import(
  "@chatbotx.io/flow-config"
)

const run = (
  action: (typeof pipelineStepActions.options)[number],
  flowExecutionKey?: string,
) =>
  handlePipelineStep({
    conversation: { workspaceId: "ws-1", contactId: "c-1" },
    contactInbox: { id: "ci-1" },
    flowVersion: { flowId: "flow-1" },
    flowExecutionKey,
    step: pipelineStepDefaultFn(action, { id: "s-1", pipelineId: "p-1" }),
  } as never)

describe("handlePipelineStep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test.each(
    pipelineStepActions.options,
  )("%s forwards the workspace, contact, flow and execution key", async (action) => {
    runPipelineFlowAction.mockResolvedValue({ status: "success" })
    const result = await run(action, "exec-1")
    expect(result).toEqual({
      status: "success",
      result: null,
      errorMessage: undefined,
    })
    const [step, ctx] = runPipelineFlowAction.mock.calls[0]
    expect(step.action).toBe(action)
    expect(ctx).toMatchObject({
      workspaceId: "ws-1",
      contactId: "c-1",
      flowId: "flow-1",
      flowExecutionKey: "exec-1",
    })
  })

  test("routes skip and error outcomes with the error message", async () => {
    runPipelineFlowAction.mockResolvedValueOnce({
      status: "skip",
      message: "no item",
    })
    expect(await run("moveToStage")).toEqual({
      status: "skip",
      result: null,
      errorMessage: undefined,
    })
    runPipelineFlowAction.mockResolvedValueOnce({
      status: "error",
      message: "bad value",
    })
    expect(await run("changeValue")).toEqual({
      status: "error",
      result: null,
      errorMessage: "bad value",
    })
  })

  test("an unexpected failure propagates so the job retries", async () => {
    runPipelineFlowAction.mockRejectedValue(new Error("db down"))
    await expect(run("addToPipeline")).rejects.toThrow("db down")
  })

  test("no execution key is passed through when the executor has none", async () => {
    runPipelineFlowAction.mockResolvedValue({ status: "success" })
    await run("addComment")
    expect(
      runPipelineFlowAction.mock.calls[0][1].flowExecutionKey,
    ).toBeUndefined()
  })

  test("variables load once, only when text contains a placeholder", async () => {
    runPipelineFlowAction.mockImplementation(async (_step, ctx) => {
      expect(await ctx.interpolate("plain")).toBe("plain")
      expect(getAll).not.toHaveBeenCalled()
      expect(await ctx.interpolate("Hi {{name}}")).toBe("Hi Ada")
      expect(await ctx.interpolate("{{name}}!")).toBe("Ada!")
      return { status: "success" }
    })
    await run("changeTitle")
    expect(getAll).toHaveBeenCalledTimes(1)
  })
})

describe("flow step registries", () => {
  test("the pipeline step is wired and does not claim to produce a message", async () => {
    const { STEP_PRODUCES_MESSAGE } = await import(
      "../src/integration/handlers/flow-utils"
    )
    expect(STEP_PRODUCES_MESSAGE.pipeline).toBe(false)
  })
})
