import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  handleOrphanedIntegration: vi.fn().mockResolvedValue(undefined),
  isChannelOriginatedJob: vi.fn().mockReturnValue(false),
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
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
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
    handleOrphanedIntegration: mocks.handleOrphanedIntegration,
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
    mocks.handleOrphanedIntegration.mockResolvedValue(undefined)
    mocks.isChannelOriginatedJob.mockReturnValue(false)
    mocks.runWithWebhookExecutionContext.mockImplementation(
      (_context: unknown, callback: () => Promise<unknown>) => callback(),
    )
  })

  test("returns callback result for successful jobs", async () => {
    await expect(
      runIntegrationJobWithWebhookContext({} as never, async () => "ok"),
    ).resolves.toBe("ok")

    expect(mocks.handleOrphanedIntegration).not.toHaveBeenCalled()
  })

  test("cleans orphaned integration once and rethrows as unrecoverable", async () => {
    const error = new IntegrationNotFoundError("messenger" as never, "page-1")

    await expect(
      runIntegrationJobWithWebhookContext({} as never, () =>
        Promise.reject(error),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError)

    expect(mocks.handleOrphanedIntegration).toHaveBeenCalledWith(error)
    expect(mocks.handleOrphanedIntegration).toHaveBeenCalledTimes(1)
  })

  test("still marks orphaned jobs unrecoverable when cleanup throws", async () => {
    const error = new IntegrationNotFoundError("messenger" as never, "page-1")
    mocks.handleOrphanedIntegration.mockRejectedValue(new Error("cleanup down"))

    await expect(
      runIntegrationJobWithWebhookContext({} as never, () =>
        Promise.reject(error),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError)

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "messenger",
        identifier: "page-1",
        err: "cleanup down",
      }),
      expect.any(String),
    )
  })

  test("passes through unrelated errors", async () => {
    const error = new Error("boom")

    await expect(
      runIntegrationJobWithWebhookContext({} as never, () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error)

    expect(mocks.handleOrphanedIntegration).not.toHaveBeenCalled()
  })
})
