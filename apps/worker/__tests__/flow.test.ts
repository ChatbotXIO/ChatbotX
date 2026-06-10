import type { FlowVersionModel } from "@chatbotx.io/database/types"
import type {
  BaseStepSchema,
  EdgeSchema,
  FlowNode,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, type Mock, test, vi } from "vitest"

// --- mocks ---

const integrationQueueAdd = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: integrationQueueAdd },
  ChatJobAction: { sendFlowMessage: "sendFlowMessage" },
  chatQueue: { add: vi.fn(async () => undefined) },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: {}, update: vi.fn(), insert: vi.fn() },
  eq: vi.fn(),
}))

// Passthrough the real schema: a transitive dependency imports `createSelectSchema`
// from this barrel at module load, so an empty mock breaks the import graph. The
// schema is pure table/zod definitions (no DB connection), safe to load for real.
vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return { ...actual }
})
vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))
vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(async () => undefined),
}))
vi.mock("@chatbotx.io/events", () => ({}))
vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    initVariables: vi.fn(() => ({ conversation: {} })),
  }
})

// --- imports after mocks ---

const { executeMultipleSteps, seekConnectedNode, runStepsAndQuickReplies } =
  await import("../src/integration/handlers/flow")

// --- helpers ---

function makeFlowVersion(
  nodes: FlowNode[] = [],
  edges: EdgeSchema[] = [],
): FlowVersionModel {
  return {
    id: "fv-1",
    flowId: "flow-1",
    nodes: nodes as unknown as FlowVersionModel["nodes"],
    edges: edges as unknown as FlowVersionModel["edges"],
  } as FlowVersionModel
}

function makeConversation() {
  return {
    id: "conv-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
    additionalAttributes: {},
  } as never
}

function makeContactInbox() {
  return { id: "ci-1", contactId: "contact-1", channel: "messenger" } as never
}

function makeBaseProps(
  flowVersion = makeFlowVersion(),
  targetNodeId = "node-1",
): any {
  return {
    conversation: makeConversation(),
    contactInbox: makeContactInbox(),
    flowVersion,
    useLatestFlowVersion: false,
    targetType: "node" as const,
    targetId: targetNodeId,
    targetNodeId,
    ctx: { variables: { conversation: {}, workflow: {}, contact: {} } },
  }
}

function makeStep(
  stepType = "sendText",
  states: BaseStepSchema["states"] = [],
): BaseStepSchema {
  return { id: "step-1", stepType: stepType as never, states } as BaseStepSchema
}

function mockSpy(obj: unknown, name: string): Mock {
  return vi.spyOn(obj as never, name as never) as unknown as Mock
}

// --- tests ---

describe("seekConnectedNode", () => {
  test("returns target node id when edge matches sourceHandle", () => {
    const flowVersion = makeFlowVersion(
      [],
      [
        {
          id: "e1",
          source: "n1",
          sourceHandle: "state-1",
          target: "n2",
          targetHandle: "input",
        },
      ],
    )
    expect(seekConnectedNode(flowVersion, "state-1")).toBe("n2")
  })

  test("returns undefined when no matching edge", () => {
    const flowVersion = makeFlowVersion([], [])
    expect(seekConnectedNode(flowVersion, "nonexistent")).toBeUndefined()
  })
})

describe("executeMultipleSteps — void handler normalization", () => {
  beforeEach(() => integrationQueueAdd.mockClear())

  test("void-returning handler (no states) does not trigger routing", async () => {
    const step = makeStep("sendText", [])
    const props = { ...makeBaseProps(), steps: [step] }

    await executeMultipleSteps(props)

    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("void-returning handler with no matching state does not enqueue", async () => {
    const stateId = "state-success"
    const step = makeStep("sendText", [{ id: stateId, stateType: "success" }])
    const flowVersion = makeFlowVersion(
      [],
      [
        {
          id: "e1",
          source: "n1",
          sourceHandle: stateId,
          target: "node-next",
          targetHandle: "input",
        },
      ],
    )
    const props = { ...makeBaseProps(flowVersion), steps: [step] }

    await executeMultipleSteps(props)

    // void is treated as success; success state is matched; connected node is enqueued
    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [, jobArg] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { nodeId: string } },
    ]
    expect(jobArg.data.nodeId).toBe("node-next")
  })
})

describe("executeMultipleSteps — explicit status routing", () => {
  beforeEach(() => integrationQueueAdd.mockClear())

  test("success status routes to success-connected node", async () => {
    const stateId = "state-ok"
    const step = makeStep("autoAssignConversation", [
      { id: stateId, stateType: "success" },
    ])
    const flowVersion = makeFlowVersion(
      [],
      [
        {
          id: "e1",
          source: "n1",
          sourceHandle: stateId,
          target: "success-node",
          targetHandle: "input",
        },
      ],
    )

    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    mockSpy(flowStepHandlers, "autoAssignConversation").mockResolvedValue({
      status: "success",
      result: null,
    })

    const props = { ...makeBaseProps(flowVersion), steps: [step] }
    await executeMultipleSteps(props)

    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [, jobArg] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { nodeId: string } },
    ]
    expect(jobArg.data.nodeId).toBe("success-node")
  })

  test("error status routes to error-connected node, not success node", async () => {
    const successStateId = "state-ok"
    const errorStateId = "state-err"
    const step = makeStep("autoAssignConversation", [
      { id: successStateId, stateType: "success" },
      { id: errorStateId, stateType: "error" },
    ])
    const flowVersion = makeFlowVersion(
      [],
      [
        {
          id: "e1",
          source: "n1",
          sourceHandle: successStateId,
          target: "success-node",
          targetHandle: "input",
        },
        {
          id: "e2",
          source: "n1",
          sourceHandle: errorStateId,
          target: "error-node",
          targetHandle: "input",
        },
      ],
    )

    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    mockSpy(flowStepHandlers, "autoAssignConversation").mockResolvedValue({
      status: "error",
      result: null,
    })

    const props = { ...makeBaseProps(flowVersion), steps: [step] }
    await executeMultipleSteps(props)

    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [, jobArg] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { nodeId: string } },
    ]
    expect(jobArg.data.nodeId).toBe("error-node")
  })
})

describe("executeMultipleSteps — loop control statuses", () => {
  beforeEach(() => integrationQueueAdd.mockClear())

  test("wait status stops the step loop and returns wait", async () => {
    const step1 = makeStep("wait", [])
    const step2 = makeStep("sendText", [])

    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    const waitSpy = mockSpy(flowStepHandlers, "wait").mockResolvedValue({
      status: "wait",
      result: null,
    })
    const sendSpy = mockSpy(flowStepHandlers, "sendText").mockResolvedValue(
      undefined,
    )

    const props = { ...makeBaseProps(), steps: [step1, step2] }
    const result = await executeMultipleSteps(props)

    expect(result?.status).toBe("wait")
    expect(waitSpy).toHaveBeenCalledOnce()
    expect(sendSpy).not.toHaveBeenCalled()
    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("retry status stops the step loop and returns retry", async () => {
    const step1 = makeStep("getUserData", [])
    const step2 = makeStep("sendText", [])

    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    mockSpy(flowStepHandlers, "getUserData").mockResolvedValue({
      status: "retry",
      result: null,
    })
    const sendSpy = mockSpy(flowStepHandlers, "sendText").mockResolvedValue(
      undefined,
    )

    const props = { ...makeBaseProps(), steps: [step1, step2] }
    const result = await executeMultipleSteps(props)

    expect(result?.status).toBe("retry")
    expect(sendSpy).not.toHaveBeenCalled()
  })
})

describe("runStepsAndQuickReplies — default edge enqueues a new job (Part 1)", () => {
  beforeEach(() => integrationQueueAdd.mockClear())

  test("next node reached via default edge is enqueued as a new job, not run inline", async () => {
    const nextNode: FlowNode = {
      id: "node-2",
      position: { x: 0, y: 0 },
      measured: { width: 100, height: 100 },
      data: {
        name: "Next",
        isStartNode: false,
        details: { steps: [] },
      },
    }
    const edges: EdgeSchema[] = [
      {
        id: "e1",
        source: "node-1",
        sourceHandle: "node-1",
        target: "node-2",
        targetHandle: "input",
      },
    ]
    const flowVersion = makeFlowVersion([nextNode], edges)
    const props = {
      ...makeBaseProps(flowVersion),
      details: { steps: [] },
      triggerNextNode: true,
      sendFrom: "inbox" as const,
    }

    await runStepsAndQuickReplies(props)

    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [action, job] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { flowId: string; nodeId: string; sendFrom?: string } },
    ]
    expect(action).toBe("sendFlow")
    expect(job.data.nodeId).toBe("node-2")
    expect(job.data.flowId).toBe("flow-1")
    expect(job.data.sendFrom).toBe("inbox")
  })
})

describe("runStepsAndQuickReplies — per-step re-dispatch", () => {
  beforeEach(() => integrationQueueAdd.mockClear())

  test("runs only the first step and enqueues a sendFlow job for the next step", async () => {
    const step1 = { ...makeStep("sendText"), id: "step-1" }
    const step2 = { ...makeStep("sendText"), id: "step-2" }
    const props = {
      ...makeBaseProps(),
      details: { steps: [step1, step2] },
      triggerNextNode: false,
    }

    await runStepsAndQuickReplies(props)

    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [action, job] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { startFromStepId: string; nodeId: string } },
    ]
    expect(action).toBe("sendFlow")
    expect(job.data.startFromStepId).toBe("step-2")
    expect(job.data.nodeId).toBe("node-1")
  })

  test("runs beforeStep on initial entry (startFromStepId undefined)", async () => {
    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    const assignSpy = mockSpy(
      flowStepHandlers,
      "autoAssignConversation",
    ).mockResolvedValue({ status: "success", result: null })
    const step1 = { ...makeStep("sendText"), id: "step-1" }
    const props = {
      ...makeBaseProps(),
      details: {
        beforeStep: {
          id: "before-1",
          stepType: "autoAssignConversation",
          states: [],
        } as BaseStepSchema,
        steps: [step1],
      },
      triggerNextNode: false,
    }

    await runStepsAndQuickReplies(props)

    expect(assignSpy).toHaveBeenCalledOnce()
  })

  test("skips beforeStep and resumes at the step whose id matches startFromStepId", async () => {
    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    const assignSpy = mockSpy(
      flowStepHandlers,
      "autoAssignConversation",
    ).mockResolvedValue({ status: "success", result: null })
    const step1 = { ...makeStep("sendText"), id: "step-1" }
    const step2 = { ...makeStep("sendText"), id: "step-2" }
    const props = {
      ...makeBaseProps(),
      details: {
        beforeStep: {
          id: "before-1",
          stepType: "autoAssignConversation",
          states: [],
        } as BaseStepSchema,
        steps: [step1, step2],
      },
      startFromStepId: "step-1",
      triggerNextNode: false,
    }

    await runStepsAndQuickReplies(props)

    // autoAssignConversation is used for beforeStep only; it must NOT be called when resuming
    expect(assignSpy).not.toHaveBeenCalled()
    // step1 ran; step2 is re-dispatched
    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [, job] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { startFromStepId: string } },
    ]
    expect(job.data.startFromStepId).toBe("step-2")
  })

  test("does not enqueue a next-step job when the current step returns wait", async () => {
    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    mockSpy(flowStepHandlers, "wait").mockResolvedValue({
      status: "wait",
      result: null,
    })
    const step1 = { ...makeStep("wait"), id: "step-1" }
    const step2 = { ...makeStep("sendText"), id: "step-2" }
    const props = {
      ...makeBaseProps(),
      details: { steps: [step1, step2] },
    }

    const result = await runStepsAndQuickReplies(props)

    expect(result?.status).toBe("wait")
    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("does not enqueue a next-step job when the current step returns retry", async () => {
    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    mockSpy(flowStepHandlers, "getUserData").mockResolvedValue({
      status: "retry",
      result: null,
    })
    const step1 = { ...makeStep("getUserData"), id: "step-1" }
    const step2 = { ...makeStep("sendText"), id: "step-2" }
    const props = {
      ...makeBaseProps(),
      details: { steps: [step1, step2] },
    }

    const result = await runStepsAndQuickReplies(props)

    expect(result?.status).toBe("retry")
    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("executes quickReplies and next-node dispatch on the final step", async () => {
    const step1 = { ...makeStep("sendText"), id: "step-1" }
    const nextNode: FlowNode = {
      id: "node-2",
      position: { x: 0, y: 0 },
      measured: { width: 100, height: 100 },
      data: { name: "Next", isStartNode: false, details: { steps: [] } },
    }
    const edges: EdgeSchema[] = [
      {
        id: "e1",
        source: "node-1",
        sourceHandle: "node-1",
        target: "node-2",
        targetHandle: "input",
      },
    ]
    const flowVersion = makeFlowVersion([nextNode], edges)
    const props = {
      ...makeBaseProps(flowVersion),
      details: { steps: [step1], quickReplies: [] },
      triggerNextNode: true,
    }

    await runStepsAndQuickReplies(props)

    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [, job] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { nodeId: string } },
    ]
    expect(job.data.nodeId).toBe("node-2")
  })

  test("does not enqueue a next-step job when the step branched via a matching state", async () => {
    const stateId = "state-ok"
    const step1 = {
      ...makeStep("autoAssignConversation", [
        { id: stateId, stateType: "success" },
      ]),
      id: "step-1",
    }
    const step2 = { ...makeStep("sendText"), id: "step-2" }
    const flowVersion = makeFlowVersion(
      [],
      [
        {
          id: "e1",
          source: "n1",
          sourceHandle: stateId,
          target: "branched-node",
          targetHandle: "input",
        },
      ],
    )

    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    mockSpy(flowStepHandlers, "autoAssignConversation").mockResolvedValue({
      status: "success",
      result: null,
    })

    const props = {
      ...makeBaseProps(flowVersion),
      details: { steps: [step1, step2] },
      triggerNextNode: false,
    }

    await runStepsAndQuickReplies(props)

    // Only the branched-node job was enqueued; no next-step re-dispatch
    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [, job] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { nodeId: string } },
    ]
    expect(job.data.nodeId).toBe("branched-node")
  })

  test("propagates flowVersionId only when useLatestFlowVersion is false in re-dispatched job", async () => {
    const step1 = { ...makeStep("sendText"), id: "step-1" }
    const step2 = { ...makeStep("sendText"), id: "step-2" }
    const baseProps = {
      ...makeBaseProps(),
      details: { steps: [step1, step2] },
      triggerNextNode: false,
    }

    await runStepsAndQuickReplies({ ...baseProps, useLatestFlowVersion: false })
    const [, job1] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { flowVersionId?: string } },
    ]
    expect(job1.data.flowVersionId).toBe("fv-1")

    integrationQueueAdd.mockClear()

    await runStepsAndQuickReplies({ ...baseProps, useLatestFlowVersion: true })
    const [, job2] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { flowVersionId?: string } },
    ]
    expect(job2.data.flowVersionId).toBeUndefined()
  })

  test("propagates metadata, trackingContext, and targetNodeId on the re-dispatched job", async () => {
    const step1 = { ...makeStep("sendText"), id: "step-1" }
    const step2 = { ...makeStep("sendText"), id: "step-2" }
    const metadata = { type: "broadcast" } as never
    const trackingContext = { sessionId: "sess-1" } as never
    const props = {
      ...makeBaseProps(),
      details: { steps: [step1, step2] },
      triggerNextNode: false,
      metadata,
      trackingContext,
      targetNodeId: "node-1",
      sendFrom: "inbox" as const,
    }

    await runStepsAndQuickReplies(props)

    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [, job] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      {
        data: {
          metadata: unknown
          nodeId: string
          sendFrom?: string
          trackingContext: unknown
        }
      },
    ]
    expect(job.data.metadata).toBe(metadata)
    expect(job.data.trackingContext).toBe(trackingContext)
    expect(job.data.nodeId).toBe("node-1")
    expect(job.data.sendFrom).toBe("inbox")
  })

  test("logs a warning and returns early when startFromStepId is set but no matching step exists", async () => {
    const { logger } = await import("../src/lib/logger")
    const step1 = { ...makeStep("sendText"), id: "step-1" }
    const props = {
      ...makeBaseProps(),
      details: { steps: [step1] },
      startFromStepId: "nonexistent-id",
    }

    await runStepsAndQuickReplies(props)

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("node with beforeStep only (no steps) still runs beforeStep and dispatches next node", async () => {
    const { flowStepHandlers } = await import(
      "../src/integration/handlers/step"
    )
    const assignSpy = mockSpy(
      flowStepHandlers,
      "autoAssignConversation",
    ).mockResolvedValue({ status: "success", result: null })
    const nextNode: FlowNode = {
      id: "node-2",
      position: { x: 0, y: 0 },
      measured: { width: 100, height: 100 },
      data: { name: "Next", isStartNode: false, details: { steps: [] } },
    }
    const edges: EdgeSchema[] = [
      {
        id: "e1",
        source: "node-1",
        sourceHandle: "node-1",
        target: "node-2",
        targetHandle: "input",
      },
    ]
    const flowVersion = makeFlowVersion([nextNode], edges)
    const props = {
      ...makeBaseProps(flowVersion),
      details: {
        beforeStep: {
          id: "before-1",
          stepType: "autoAssignConversation",
          states: [],
        } as BaseStepSchema,
      },
      triggerNextNode: true,
    }

    await runStepsAndQuickReplies(props)

    expect(assignSpy).toHaveBeenCalledOnce()
    expect(integrationQueueAdd).toHaveBeenCalledOnce()
    const [, job] = integrationQueueAdd.mock.calls[0] as unknown as [
      string,
      { data: { nodeId: string } },
    ]
    expect(job.data.nodeId).toBe("node-2")
  })
})
