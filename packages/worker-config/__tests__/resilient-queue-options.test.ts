import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  queueOptions: new Map<string, unknown>(),
}))

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(name: string, options: unknown) {
      mocks.queueOptions.set(name, options)
    }
  },
}))

vi.mock("../src/lib/connection", () => ({
  fakeQueue: { add: vi.fn() },
  getRedisConnection: () => ({}),
  isNoRedisEnv: () => false,
  resilientJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
  },
}))

const { queueNames } = await import("../src/lib/types")
await import("../src/queues/chat")
await import("../src/queues/integration")

describe("resilient queue defaults", () => {
  test("gives chat and integration queues five exponential retry attempts", () => {
    for (const queueName of [
      queueNames.enum.chat,
      queueNames.enum.integration,
    ]) {
      expect(mocks.queueOptions.get(queueName)).toMatchObject({
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 10_000 },
        },
      })
    }
  })
})
