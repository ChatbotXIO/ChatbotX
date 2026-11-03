import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  cleanupOrphanedIntegrationOnce: vi.fn().mockResolvedValue(undefined),
  isChannelOriginatedJob: vi.fn().mockReturnValue(false),
  isInboundWebhookJob: vi.fn().mockReturnValue(false),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  runWithWebhookExecutionContext: vi.fn(
    (_context: unknown, callback: () => Promise<unknown>) => callback(),
  ),
}))

vi.mock("@chatbotx.io/events/context", () => ({
  runWithWebhookExecutionContext: mocks.runWithWebhookExecutionContext,
}))

vi.mock("../src/integration/channel-origin", () => ({
  isChannelOriginatedJob: mocks.isChannelOriginatedJob,
  isInboundWebhookJob: mocks.isInboundWebhookJob,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}))

vi.mock("../src/services/orphaned-integration-cleanup", () => {
  class IntegrationNotFoundError extends Error {
    readonly channel: string
    readonly identifier: string

    constructor(channel: string, identifier: string) {
      super(`Integration not found: ${channel} ${identifier}`)
      this.name = "IntegrationNotFoundError"
      this.channel = channel
      this.identifier = identifier
    }
  }

  return {
    cleanupOrphanedIntegrationOnce: mocks.cleanupOrphanedIntegrationOnce,
    IntegrationNotFoundError,
  }
})

const { runIntegrationJobWithWebhookContext } = await import(
  "../src/integration/job-context"
)
const { IntegrationNotFoundError } = await import(
  "../src/services/orphaned-integration-cleanup"
)

describe("runIntegrationJobWithWebhookContext orphan handling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isChannelOriginatedJob.mockReturnValue(false)
    mocks.isInboundWebhookJob.mockReturnValue(false)
    mocks.runWithWebhookExecutionContext.mockImplementation(
      (_context: unknown, callback: () => Promise<unknown>) => callback(),
    )
  })

  test("returns callback result for successful jobs", async () => {
    await expect(
      runIntegrationJobWithWebhookContext({} as never, async () => "ok"),
    ).resolves.toBe("ok")

    expect(mocks.cleanupOrphanedIntegrationOnce).not.toHaveBeenCalled()
  })

  test("completes an internal job for a missing Messenger integration", async () => {
    const error = new IntegrationNotFoundError("messenger" as never, "page-1")
    const jobData = { type: "sendSequenceFlow" } as never

    await expect(
      runIntegrationJobWithWebhookContext(jobData, () => Promise.reject(error)),
    ).resolves.toBeUndefined()

    expect(mocks.cleanupOrphanedIntegrationOnce).toHaveBeenCalledWith(error)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      {
        channel: "messenger",
        err: error,
        identifier: "page-1",
        jobType: "sendSequenceFlow",
      },
      "Integration not found; completing job without retry",
    )
  })

  test("completes an inbound job for a missing Messenger integration", async () => {
    mocks.isChannelOriginatedJob.mockReturnValue(true)
    mocks.isInboundWebhookJob.mockReturnValue(true)
    const error = new IntegrationNotFoundError("messenger" as never, "page-1")
    const jobData = { type: "incomingMessage" } as never

    await expect(
      runIntegrationJobWithWebhookContext(jobData, () => Promise.reject(error)),
    ).resolves.toBeUndefined()

    expect(mocks.cleanupOrphanedIntegrationOnce).toHaveBeenCalledWith(error)
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        channel: "messenger",
        identifier: "page-1",
        jobType: "incomingMessage",
      },
      "Integration not found for inbound event; skipping job",
    )
  })

  test("completes contactMarkAsRead for a missing Zalo integration", async () => {
    mocks.isInboundWebhookJob.mockReturnValue(true)
    const error = new IntegrationNotFoundError("zalo" as never, "oa-1")
    const jobData = { type: "contactMarkAsRead" } as never

    await expect(
      runIntegrationJobWithWebhookContext(jobData, () => Promise.reject(error)),
    ).resolves.toBeUndefined()

    expect(mocks.cleanupOrphanedIntegrationOnce).toHaveBeenCalledWith(error)
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { channel: "zalo", identifier: "oa-1", jobType: "contactMarkAsRead" },
      "Integration not found for inbound event; skipping job",
    )
  })

  test("completes an internal job for a missing Zalo integration", async () => {
    const error = new IntegrationNotFoundError("zalo" as never, "oa-1")
    const jobData = { type: "sendSequenceFlow" } as never

    await expect(
      runIntegrationJobWithWebhookContext(jobData, () => Promise.reject(error)),
    ).resolves.toBeUndefined()

    expect(mocks.cleanupOrphanedIntegrationOnce).toHaveBeenCalledWith(error)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      {
        channel: "zalo",
        err: error,
        identifier: "oa-1",
        jobType: "sendSequenceFlow",
      },
      "Integration not found; completing job without retry",
    )
  })

  test("passes through unrelated errors", async () => {
    const error = new Error("boom")

    await expect(
      runIntegrationJobWithWebhookContext({} as never, () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error)

    expect(mocks.cleanupOrphanedIntegrationOnce).not.toHaveBeenCalled()
  })
})
