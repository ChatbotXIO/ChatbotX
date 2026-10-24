import { beforeAll, describe, expect, test, vi } from "vitest"

// Boots the dedicated FB Marketing Messages consumer and asserts it runs on
// its own queue with its own concurrency, routing each job to the campaign
// step handler.

type Captured = {
  queueName: unknown
  processor: (job: { id?: string; data: unknown }) => Promise<unknown>
  options: Record<string, unknown>
}

const state = vi.hoisted(() => ({
  workers: [] as Captured[],
  process: vi.fn(async () => undefined),
}))

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(
      queueName: unknown,
      processor: Captured["processor"],
      options: Record<string, unknown>,
    ) {
      state.workers.push({ queueName, processor, options })
    }
    on() {
      // not exercised
    }
    close() {
      return Promise.resolve()
    }
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  MarketingMessageJobAction: { processCampaign: "processCampaign" },
  queueNames: { enum: { marketingMessage: "marketingMessage" } },
  defaultWorkerOptions: { concurrency: 5 },
  getQueueConnection: vi.fn(() => ({})),
}))
vi.mock("../src/env", () => ({
  env: { MARKETING_MESSAGE_WORKER_CONCURRENCY: 7 },
}))
vi.mock("../src/schedule/handlers/process-marketing-message-campaign", () => ({
  processMarketingMessageCampaign: state.process,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

beforeAll(async () => {
  const { startMarketingMessageWorker } = await import(
    "../src/marketing-message/consumer"
  )
  startMarketingMessageWorker()
})

describe("marketing message worker", () => {
  test("consumes the dedicated queue with its own concurrency", () => {
    expect(state.workers).toHaveLength(1)
    expect(state.workers[0]?.queueName).toBe("marketingMessage")
    expect(state.workers[0]?.options.concurrency).toBe(7)
  })

  test("routes processCampaign jobs to the campaign step handler", async () => {
    await state.workers[0]?.processor({
      id: "j1",
      data: {
        type: "processCampaign",
        data: { campaignRowId: "c1", step: "dispatch" },
      },
    })
    expect(state.process).toHaveBeenCalledWith({
      campaignRowId: "c1",
      step: "dispatch",
    })
  })
})
