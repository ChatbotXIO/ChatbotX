import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  cleanupOrphanedIntegrationOnce: vi.fn().mockResolvedValue(undefined),
  handleOrphanedIntegration: vi.fn().mockResolvedValue(undefined),
  isChannelOriginatedJob: vi.fn().mockReturnValue(false),
  loggerInfo: vi.fn(),
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
    info: mocks.loggerInfo,
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
    mocks.cleanupOrphanedIntegrationOnce.mockResolvedValue(undefined)
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

  test("completes a channel-originated job for a missing Messenger integration", async () => {
    mocks.isChannelOriginatedJob.mockReturnValue(true)
    const error = new IntegrationNotFoundError("messenger" as never, "page-1")

    await expect(
      runIntegrationJobWithWebhookContext({} as never, () =>
        Promise.reject(error),
      ),
    ).resolves.toBeUndefined()

    expect(mocks.cleanupOrphanedIntegrationOnce).toHaveBeenCalledWith(error)
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { channel: "messenger", identifier: "page-1" },
      "Integration not found for inbound event; skipping job",
    )
  })

  test("completes a channel-originated job for a missing Zalo integration", async () => {
    mocks.isChannelOriginatedJob.mockReturnValue(true)
    const error = new IntegrationNotFoundError("zalo" as never, "oa-1")

    await expect(
      runIntegrationJobWithWebhookContext({} as never, () =>
        Promise.reject(error),
      ),
    ).resolves.toBeUndefined()

    expect(mocks.cleanupOrphanedIntegrationOnce).toHaveBeenCalledWith(error)
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { channel: "zalo", identifier: "oa-1" },
      expect.any(String),
    )
  })

  test("still fails an internal job for a missing Zalo integration", async () => {
    const error = new IntegrationNotFoundError("zalo" as never, "oa-1")

    await expect(
      runIntegrationJobWithWebhookContext({} as never, () =>
        Promise.reject(error),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError)

    expect(mocks.handleOrphanedIntegration).toHaveBeenCalledWith(error)
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
