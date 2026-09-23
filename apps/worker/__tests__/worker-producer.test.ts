// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { findManySpy, producerSendSpy } = vi.hoisted(() => ({
  findManySpy: vi.fn(),
  producerSendSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      sequenceDispatchModel: {
        findMany: findManySpy,
      },
    },
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: {
    useExisting: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class {},
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  SEQUENCE_SCHEDULER_QUEUE_NAME: "sequence-scheduler",
}))

vi.mock("@chatbotx.io/worker-config/message-queue/factory", () => ({
  createProducer: vi.fn().mockReturnValue({
    close: vi.fn(),
    send: producerSendSpy,
  }),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}))

const { SchedulerWorker } = await import(
  "../src/sequence-scheduler/worker-producer"
)

function attachProducer(worker: InstanceType<typeof SchedulerWorker>) {
  ;(
    worker as unknown as {
      _producer: { close: () => Promise<void>; send: typeof producerSendSpy }
    }
  )._producer = {
    close: vi.fn().mockResolvedValue(undefined),
    send: producerSendSpy,
  }
}

describe("SchedulerWorker.publishDispatches", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findManySpy.mockResolvedValue([
      { id: "dispatch-1", workspaceId: "workspace-1" },
      { id: "dispatch-2", workspaceId: "workspace-2" },
    ])
  })

  test("publishes pending dispatch messages with workspaceId", async () => {
    const worker = new SchedulerWorker({ buckets: [0] })
    attachProducer(worker)

    await worker.publishDispatches(7, [
      { dispatchId: "dispatch-1" },
      { dispatchId: "dispatch-2" },
    ])

    expect(findManySpy).toHaveBeenCalledWith({
      columns: { id: true, workspaceId: true },
      where: {
        id: { in: ["dispatch-1", "dispatch-2"] },
        status: "pending",
      },
    })
    expect(producerSendSpy).toHaveBeenCalledOnce()
    const messages = producerSendSpy.mock.calls[0]?.[0] as Array<{
      key: string
      value: string
    }>
    expect(messages.map((message) => JSON.parse(message.value))).toEqual([
      expect.objectContaining({
        bucket: 7,
        dispatchId: "dispatch-1",
        workspaceId: "workspace-1",
      }),
      expect.objectContaining({
        bucket: 7,
        dispatchId: "dispatch-2",
        workspaceId: "workspace-2",
      }),
    ])
  })

  test("skips claimed dispatch ids without a pending database row", async () => {
    findManySpy.mockResolvedValue([{ id: "dispatch-1", workspaceId: "ws-1" }])
    const worker = new SchedulerWorker({ buckets: [0] })
    attachProducer(worker)

    await worker.publishDispatches(7, [
      { dispatchId: "dispatch-1" },
      { dispatchId: "missing-dispatch" },
    ])

    const messages = producerSendSpy.mock.calls[0]?.[0] as Array<{
      value: string
    }>
    expect(messages).toHaveLength(1)
    expect(JSON.parse(messages[0].value)).toMatchObject({
      dispatchId: "dispatch-1",
      workspaceId: "ws-1",
    })
  })
})
