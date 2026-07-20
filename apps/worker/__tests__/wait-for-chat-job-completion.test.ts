import { findOrFail } from "@chatbotx.io/database/client"
import { chatQueue } from "@chatbotx.io/worker-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
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
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
}))

const { waitForChatJobCompletion, sendMessageAndWait } = await import(
  "../src/integration/utils/message"
)

describe("waitForChatJobCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("awaits job.waitUntilFinished with a bounded timeout", async () => {
    const job = { waitUntilFinished: vi.fn(async () => "done") }

    await waitForChatJobCompletion(job as never)

    expect(job.waitUntilFinished).toHaveBeenCalledOnce()
    // Second arg is the TTL that bounds the wait — the fix that stops a stalled
    // chat worker from leaking a QueueEvents listener + closures until OOM.
    const [, ttl] = job.waitUntilFinished.mock.calls[0]
    expect(ttl).toBeGreaterThan(0)
    expect(mocks.queueEvents).toHaveBeenCalledOnce()
  })

  test("is a no-op for a non-job value", async () => {
    await expect(waitForChatJobCompletion(undefined as never)).resolves.toBe(
      undefined,
    )

    expect(mocks.queueEvents).not.toHaveBeenCalled()
  })

  test("swallows and logs a failed or timed-out wait", async () => {
    const err = new Error("send failed")
    const job = { waitUntilFinished: vi.fn(async () => Promise.reject(err)) }
    const context = { conversationId: "conv-1", stepId: "step-1" }

    await expect(waitForChatJobCompletion(job as never, context)).resolves.toBe(
      undefined,
    )

    expect(mocks.loggerError).toHaveBeenCalledOnce()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { ...context, err },
      "Chat job did not complete in time or failed; continuing flow",
    )
  })
})

describe("sendMessageAndWait", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(findOrFail).mockResolvedValue({ id: "conv-1" } as never)
  })

  test("does not throw when the chat job wait rejects (avoids job retry / double send)", async () => {
    const err = new Error("wait timed out")
    vi.mocked(chatQueue.add).mockResolvedValue({
      waitUntilFinished: vi.fn(async () => Promise.reject(err)),
    } as never)

    await expect(sendMessageAndWait("conv-1", "hello")).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledWith(
      { conversationId: "conv-1", err },
      "Chat job did not complete in time or failed; continuing flow",
    )
  })

  test("awaits the enqueued job with a bounded timeout", async () => {
    const waitUntilFinished = vi.fn(async () => "done")
    vi.mocked(chatQueue.add).mockResolvedValue({ waitUntilFinished } as never)

    await sendMessageAndWait("conv-1", "hello")

    expect(waitUntilFinished).toHaveBeenCalledOnce()
    const [, ttl] = waitUntilFinished.mock.calls[0]
    expect(ttl).toBeGreaterThan(0)
  })
})
