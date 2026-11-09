import type { FlowVersionModel } from "@chatbotx.io/database/types"
import { type EdgeSchema, stepTypes } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

// A step that ends its node by starting another node hands the run's pending
// continuation to that node's job (`thenSendFlow`), so the continuation runs
// after that node's chain instead of beside it. It takes the continuation
// only when it actually enqueues a node.

const mocks = vi.hoisted(() => ({ queueAdd: vi.fn() }))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  integrationQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
}))

const { flowStepHandlers } = await import("../src/integration/handlers/step")
const { sendFlow } = await import("../src/integration/handlers/flow-utils")

const pending = {
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  nodeId: "continue-node",
}

const flowVersion = (edges: EdgeSchema[]) =>
  ({ id: "fv-1", flowId: "flow-1", edges }) as unknown as FlowVersionModel

const baseProps = (
  step: Record<string, unknown>,
  edges: EdgeSchema[] = [],
) => ({
  conversation: { id: "conv-1", workspaceId: "ws-1" },
  contactInbox: { id: "ci-1" },
  flowVersion: flowVersion(edges),
  useLatestFlowVersion: false,
  targetId: "split-node",
  step,
  takeContinuation: vi.fn(() => pending),
})

const enqueuedData = () =>
  (mocks.queueAdd.mock.calls[0]?.[1] as { data: Record<string, unknown> })?.data

describe("jump steps hand the pending continuation to the node they start", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test.each([
    [
      "startAnotherNode",
      stepTypes.enum.startAnotherNode,
      { id: "s-1", nodeId: "target-node" },
    ],
    [
      "startExternalFlow",
      stepTypes.enum.startExternalFlow,
      { id: "s-2", flowId: "11" },
    ],
    [
      "startExternalNode",
      stepTypes.enum.startExternalNode,
      { id: "s-3", flowId: "11", nodeId: "22" },
    ],
  ] as const)("%s carries it on the job it enqueues", async (_label, stepType, step) => {
    const props = baseProps(step)

    await flowStepHandlers[stepType]?.(props as never)

    expect(props.takeContinuation).toHaveBeenCalledOnce()
    expect(enqueuedData()?.thenSendFlow).toEqual(pending)
  })

  test("splitTraffic carries it on the chosen branch", async () => {
    const props = baseProps({ id: "s-4", cases: [{ value: 100 }] }, [
      {
        id: "e-1",
        source: "split-node",
        sourceHandle: "split-node-case-0",
        target: "branch-node",
      },
    ] as EdgeSchema[])

    await flowStepHandlers[stepTypes.enum.splitTraffic]?.(props as never)

    expect(enqueuedData()).toMatchObject({
      nodeId: "branch-node",
      thenSendFlow: pending,
    })
  })

  test("splitTraffic with no connected branch leaves it to the run", async () => {
    const props = baseProps({ id: "s-5", cases: [{ value: 100 }] }, [])

    await flowStepHandlers[stepTypes.enum.splitTraffic]?.(props as never)

    expect(mocks.queueAdd).not.toHaveBeenCalled()
    expect(props.takeContinuation).not.toHaveBeenCalled()
  })

  test.each([
    [true, "ok-node"],
    [false, "error-node"],
  ])("a success/error route (success=%s) carries it", async (isSuccess, target) => {
    const props = baseProps(
      { id: "s-6", successNodeId: "ok-handle", errorNodeId: "error-handle" },
      [
        {
          id: "e-ok",
          source: "n",
          sourceHandle: "ok-handle",
          target: "ok-node",
        },
        {
          id: "e-err",
          source: "n",
          sourceHandle: "error-handle",
          target: "error-node",
        },
      ] as EdgeSchema[],
    )

    await sendFlow(props as never, isSuccess)

    expect(enqueuedData()).toMatchObject({
      nodeId: target,
      thenSendFlow: pending,
    })
  })

  test("a success/error route with nothing connected leaves it to the run", async () => {
    const props = baseProps({ id: "s-7", successNodeId: "ok-handle" }, [])

    await sendFlow(props as never, true)

    expect(mocks.queueAdd).not.toHaveBeenCalled()
    expect(props.takeContinuation).not.toHaveBeenCalled()
  })

  test("a step run without a pending continuation enqueues as before", async () => {
    await flowStepHandlers[stepTypes.enum.startAnotherNode]?.({
      ...baseProps({ id: "s-8", nodeId: "target-node" }),
      takeContinuation: undefined,
    } as never)

    expect(enqueuedData()?.thenSendFlow).toBeUndefined()
  })
})
