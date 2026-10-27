import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  instagramIntegrationExistsByPageId: vi.fn().mockResolvedValue(false),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  redisSet: vi.fn().mockResolvedValue("OK"),
  resolvePlatformAppAccessToken: vi.fn().mockResolvedValue("app-token"),
  unsubscribeInstagram: vi.fn().mockResolvedValue(undefined),
  unsubscribeMessenger: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  instagramIntegrationService: {
    existsByPageId: mocks.instagramIntegrationExistsByPageId,
  },
  platformCredentialService: {
    resolvePlatformAppAccessToken: mocks.resolvePlatformAppAccessToken,
  },
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  unsubscribePageFromInstagramWebhook: mocks.unsubscribeInstagram,
}))

vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  unsubscribePageFromAppWebhook: mocks.unsubscribeMessenger,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  getRedisConnection: () => ({ set: mocks.redisSet }),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
}))

const {
  cleanupOrphanedIntegrationOnce,
  handleOrphanedIntegration,
  IntegrationNotFoundError,
} = await import("../src/services/orphaned-integration-cleanup")

describe("handleOrphanedIntegration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.instagramIntegrationExistsByPageId.mockResolvedValue(false)
    mocks.redisSet.mockResolvedValue("OK")
    mocks.resolvePlatformAppAccessToken.mockResolvedValue("app-token")
    mocks.unsubscribeInstagram.mockResolvedValue(undefined)
    mocks.unsubscribeMessenger.mockResolvedValue(undefined)
  })

  test("maps messenger orphans to page unsubscribe", async () => {
    await handleOrphanedIntegration(
      new IntegrationNotFoundError("messenger", "page-1"),
    )
    expect(mocks.unsubscribeMessenger).toHaveBeenCalledWith({
      pageId: "page-1",
      appAccessToken: "app-token",
    })
  })

  test("maps instagram orphans to ig id unsubscribe", async () => {
    await handleOrphanedIntegration(
      new IntegrationNotFoundError("instagram", "ig-1"),
    )

    expect(mocks.unsubscribeInstagram).toHaveBeenCalledWith({
      igId: "ig-1",
      accessToken: "app-token",
    })
  })

  test("skips unsupported channels", async () => {
    await handleOrphanedIntegration(
      new IntegrationNotFoundError("whatsapp", "phone-number-1"),
    )

    expect(mocks.unsubscribeMessenger).not.toHaveBeenCalled()
    expect(mocks.unsubscribeInstagram).not.toHaveBeenCalled()
    expect(mocks.loggerInfo).toHaveBeenCalled()
  })

  test("skips Threads as an unsupported channel", async () => {
    await handleOrphanedIntegration(
      new IntegrationNotFoundError("threads", "thread-1"),
    )

    expect(mocks.resolvePlatformAppAccessToken).not.toHaveBeenCalled()
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { channel: "threads", identifier: "thread-1" },
      "Skipping orphaned integration cleanup for unsupported channel",
    )
  })

  test("skips messenger cleanup when an Instagram sibling still exists", async () => {
    mocks.instagramIntegrationExistsByPageId.mockResolvedValue(true)

    await handleOrphanedIntegration(
      new IntegrationNotFoundError("messenger", "page-1"),
    )

    expect(mocks.unsubscribeMessenger).not.toHaveBeenCalled()
    expect(mocks.resolvePlatformAppAccessToken).not.toHaveBeenCalled()
  })

  test("warns and skips when platform credential is missing", async () => {
    mocks.resolvePlatformAppAccessToken.mockResolvedValue(undefined)

    await handleOrphanedIntegration(
      new IntegrationNotFoundError("instagram", "ig-1"),
    )

    expect(mocks.unsubscribeInstagram).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "instagram",
        identifier: "ig-1",
      }),
      expect.any(String),
    )
  })

  test("swallows sibling lookup failures and logs the error object", async () => {
    mocks.instagramIntegrationExistsByPageId.mockRejectedValue(
      new Error("database unavailable"),
    )

    await expect(
      handleOrphanedIntegration(
        new IntegrationNotFoundError("messenger", "page-1"),
      ),
    ).resolves.toBeUndefined()

    expect(mocks.unsubscribeMessenger).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "messenger",
        identifier: "page-1",
        err: expect.any(Error),
      }),
      expect.any(String),
    )
  })

  test("swallows credential lookup failures and logs the error object", async () => {
    mocks.resolvePlatformAppAccessToken.mockRejectedValue(
      new Error("decrypt failed"),
    )

    await expect(
      handleOrphanedIntegration(
        new IntegrationNotFoundError("instagram", "ig-1"),
      ),
    ).resolves.toBeUndefined()

    expect(mocks.unsubscribeInstagram).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "instagram",
        identifier: "ig-1",
        err: expect.any(Error),
      }),
      expect.any(String),
    )
  })

  test("swallows unsubscribe failures and logs the error object", async () => {
    mocks.unsubscribeMessenger.mockRejectedValue(new Error("graph failed"))

    await expect(
      handleOrphanedIntegration(
        new IntegrationNotFoundError("messenger", "page-1"),
      ),
    ).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
      }),
      expect.any(String),
    )
  })
})

describe("cleanupOrphanedIntegrationOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.instagramIntegrationExistsByPageId.mockResolvedValue(false)
    mocks.redisSet.mockResolvedValue("OK")
    mocks.resolvePlatformAppAccessToken.mockResolvedValue("app-token")
    mocks.unsubscribeMessenger.mockResolvedValue(undefined)
  })

  test("cleans up after acquiring the throttle key", async () => {
    await cleanupOrphanedIntegrationOnce(
      new IntegrationNotFoundError("messenger", "page-1"),
    )

    expect(mocks.redisSet).toHaveBeenCalledWith(
      "orphan-integration-cleanup:messenger:page-1",
      "1",
      "EX",
      3600,
      "NX",
    )
    expect(mocks.unsubscribeMessenger).toHaveBeenCalledTimes(1)
  })

  test("skips cleanup when another worker holds the throttle key", async () => {
    mocks.redisSet.mockResolvedValue(null)

    await cleanupOrphanedIntegrationOnce(
      new IntegrationNotFoundError("messenger", "page-1"),
    )

    expect(mocks.unsubscribeMessenger).not.toHaveBeenCalled()
  })

  test.each([
    ["zalo", "oa-1"],
    ["whatsapp", "phone-number-1"],
  ] as const)("skips Redis for strategy-less %s channels", async (channel, identifier) => {
    await cleanupOrphanedIntegrationOnce(
      new IntegrationNotFoundError(channel, identifier),
    )

    expect(mocks.redisSet).not.toHaveBeenCalled()
  })

  test("logs and skips cleanup when Redis fails", async () => {
    mocks.redisSet.mockRejectedValue(new Error("redis unavailable"))

    await expect(
      cleanupOrphanedIntegrationOnce(
        new IntegrationNotFoundError("messenger", "page-1"),
      ),
    ).resolves.toBeUndefined()

    expect(mocks.unsubscribeMessenger).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "messenger",
        identifier: "page-1",
        err: expect.any(Error),
      }),
      "Orphaned integration cleanup throttle failed; skipping cleanup",
    )
  })
})
