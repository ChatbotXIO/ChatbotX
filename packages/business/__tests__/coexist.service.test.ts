import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createRun: vi.fn(),
  findIntegrationForCoexist: vi.fn(),
  setIntegrationCoexistEnabled: vi.fn(),
  tearDownActiveRunsForIntegration: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mocks.transaction,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  coexistSyncRunRepository: {
    claimRun: vi.fn(),
    createRun: mocks.createRun,
    findIntegrationForCoexist: mocks.findIntegrationForCoexist,
    findResumeCeiling: vi.fn(),
    findRunById: vi.fn(),
    markFailed: vi.fn(),
    markMaxAttemptsFailed: vi.fn(),
    markPartial: vi.fn(),
    markSucceeded: vi.fn(),
    pickDueRuns: vi.fn(),
    setIntegrationCoexistEnabled: mocks.setIntegrationCoexistEnabled,
    tearDownActiveRunsForIntegration: mocks.tearDownActiveRunsForIntegration,
    updateProgress: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    coexistInstagramSync: "coexistInstagramSync",
    coexistMessengerSync: "coexistMessengerSync",
    coexistWhatsappFlush: "coexistWhatsappFlush",
  },
}))

const { coexistJobStrategies, coexistService } = await import(
  "../src/coexist/service"
)

const tx = { tx: true }

describe("coexistService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(tx),
    )
    mocks.setIntegrationCoexistEnabled.mockResolvedValue({
      id: "integration-1",
      channel: "instagram",
    })
    mocks.findIntegrationForCoexist.mockResolvedValue({
      id: "integration-1",
      channel: "instagram",
    })
    mocks.createRun.mockResolvedValue({ id: "run-1" })
    mocks.tearDownActiveRunsForIntegration.mockResolvedValue(undefined)
  })

  test("enable flips the integration flag and creates an init run in one transaction", async () => {
    await expect(
      coexistService.enable({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        channel: "instagram",
      }),
    ).resolves.toEqual({ success: true, runId: "run-1" })

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.findIntegrationForCoexist).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      channel: "instagram",
      tx,
    })
    expect(mocks.setIntegrationCoexistEnabled).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      channel: "instagram",
      enabled: true,
      tx,
    })
    expect(mocks.createRun).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      channel: "instagram",
      triggerSource: "popup-enable",
      tx,
    })
  })

  test("enable returns not_found when the integration is invalid or not native Instagram", async () => {
    mocks.findIntegrationForCoexist.mockResolvedValueOnce(null)

    await expect(
      coexistService.enable({
        workspaceId: "workspace-1",
        integrationId: "integration-facebook-1",
        channel: "instagram",
      }),
    ).resolves.toEqual({ success: false, reason: "not_found" })

    expect(mocks.createRun).not.toHaveBeenCalled()
  })

  test("enable does not preflight quota for coexist channels", async () => {
    await expect(
      coexistService.enable({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        channel: "messenger",
      }),
    ).resolves.toEqual({ success: true, runId: "run-1" })

    expect(mocks.setIntegrationCoexistEnabled).toHaveBeenCalled()
    expect(mocks.createRun).toHaveBeenCalled()
  })

  test("disable flips the flag off and tears down active runs", async () => {
    await expect(
      coexistService.disable({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        channel: "messenger",
      }),
    ).resolves.toEqual({ success: true })

    expect(mocks.setIntegrationCoexistEnabled).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      channel: "messenger",
      enabled: false,
      tx,
    })
    expect(mocks.tearDownActiveRunsForIntegration).toHaveBeenCalledWith({
      channel: "messenger",
      integrationId: "integration-1",
      currentError: "Coexist disabled",
      tx,
    })
  })

  test("strategy registry covers pull and buffered coexist channels", () => {
    expect(coexistJobStrategies).toEqual({
      messenger: { mode: "pull", action: "coexistMessengerSync" },
      instagram: { mode: "pull", action: "coexistInstagramSync" },
      whatsapp: { mode: "buffered", action: "coexistWhatsappFlush" },
    })
  })
})
