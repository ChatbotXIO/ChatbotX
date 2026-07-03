import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  queueEvents: vi.fn(function QueueEvents() {
    return { close: vi.fn() }
  }),
}))

vi.mock("@chatbotx.io/ai", () => ({
  isImageUrl: vi.fn(() => false),
}))
vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  conversationModel: {},
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendChatMessage: "sendChatMessage" },
  chatQueue: { add: vi.fn() },
  getRedisConnection: () => ({ duplicate: () => ({}) }),
  queueNames: { enum: { chat: "chat" } },
}))
vi.mock("bullmq", () => ({
  QueueEvents: mocks.queueEvents,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}))

const { waitForChatJobCompletion } = await import(
  "../src/integration/utils/message"
)

describe("waitForChatJobCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("awaits job.waitUntilFinished for a job-like value", async () => {
    const job = { waitUntilFinished: vi.fn(async () => "done") }

    await waitForChatJobCompletion(job as never)

    expect(job.waitUntilFinished).toHaveBeenCalledOnce()
    expect(mocks.queueEvents).toHaveBeenCalledOnce()
  })

  test("is a no-op for a non-job value", async () => {
    await expect(waitForChatJobCompletion(undefined as never)).resolves.toBe(
      undefined,
    )

    expect(mocks.queueEvents).not.toHaveBeenCalled()
  })

  test("swallows and logs a failed send", async () => {
    const err = new Error("send failed")
    const job = { waitUntilFinished: vi.fn(async () => Promise.reject(err)) }
    const context = { conversationId: "conv-1", stepId: "step-1" }

    await expect(waitForChatJobCompletion(job as never, context)).resolves.toBe(
      undefined,
    )

    expect(mocks.loggerError).toHaveBeenCalledOnce()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { ...context, err },
      "Flow message chat job failed; continuing flow",
    )
  })
})
