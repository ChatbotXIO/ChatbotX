import { beforeEach, describe, expect, test, vi } from "vitest"

const integrationQueueAdd = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return { ...actual, integrationQueue: { add: integrationQueueAdd } }
})

const { createContinuationChain } = await import(
  "../src/integration/handlers/flow-continuation"
)

const continuation = {
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  flowId: "flow-1",
  nodeId: "node-2",
}
const broadcastMetadata = {
  type: "broadcast",
  broadcastId: "b-1",
  contactInboxId: "ci-1",
} as const

beforeEach(() => {
  integrationQueueAdd.mockClear()
})

describe("createContinuationChain priority", () => {
  test("a continuation of a live flow stays in FIFO order with live traffic (no priority)", async () => {
    await createContinuationChain(undefined).enqueue(continuation)

    expect(integrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      { type: "sendFlow", data: continuation },
      {},
    )
  })

  test("a broadcast continuation keeps the scheduled-send tier", async () => {
    await createContinuationChain(undefined).enqueue({
      ...continuation,
      metadata: broadcastMetadata,
    })

    expect(integrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.anything(),
      { priority: 5 },
    )
  })

  test("a deferred branch keeps its dedup jobId", async () => {
    const chain = createContinuationChain(undefined)
    chain.deferBranch({
      job: { type: "sendFlow", data: { ...continuation, nodeId: "branch" } },
      jobId: "flow-state-abc",
    })

    await chain.finish()

    expect(integrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({ nodeId: "branch" }),
      }),
      { jobId: "flow-state-abc" },
    )
  })

  test("the pending continuation released at the end of the run is prioritized too", async () => {
    await createContinuationChain({
      ...continuation,
      metadata: broadcastMetadata,
    }).finish()

    expect(integrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.anything(),
      { priority: 5 },
    )
  })
})
