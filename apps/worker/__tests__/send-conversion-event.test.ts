import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWorkspaceEvent: vi.fn(),
  updateCapiStatus: vi.fn(),
  findWorkspaceIntegration: vi.fn(),
  ensureDatasetId: vi.fn(),
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: string | undefined, fn: () => Promise<void>) =>
      await fn(),
  ),
  ensureDataset: vi.fn(),
  sendConversionEvent: vi.fn(),
  defaultQueueAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/business")>(
    "@chatbotx.io/business",
  )
  return {
    ...actual,
    integrationWhatsappService: {
      findWorkspaceIntegration: mocks.findWorkspaceIntegration,
      ensureDatasetId: mocks.ensureDatasetId,
    },
    withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
  }
})

vi.mock("@chatbotx.io/database/repositories", () => ({
  adsConversionEventRepository: {
    findWorkspaceEvent: mocks.findWorkspaceEvent,
    updateCapiStatus: mocks.updateCapiStatus,
  },
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/conversions", () => ({
  ensureDataset: mocks.ensureDataset,
  sendConversionEvent: mocks.sendConversionEvent,
}))

vi.mock("@chatbotx.io/worker-config", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/worker-config")
  >("@chatbotx.io/worker-config")
  return {
    ...actual,
    defaultQueue: { add: mocks.defaultQueueAdd },
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { handleSendConversionEvent } = await import(
  "../src/integration/handlers/ads-conversion/send-conversion-event"
)

const jobData = {
  adsConversionEventId: "ace-1",
  workspaceId: "ws-1",
}

const pendingEvent = {
  id: "ace-1",
  workspaceId: "ws-1",
  integrationWhatsappId: "iw-1",
  wabaId: "waba-1",
  eventType: "purchase" as const,
  occurredAt: new Date("2026-08-10T10:00:00.000Z"),
  sourceEventId: "source-1",
  ctwaClid: "clid-1",
  currency: "USD",
  value: "12.34",
  capiStatus: "pending" as const,
}

const integration = {
  id: "iw-1",
  workspaceId: "ws-1",
  wabaId: "waba-1",
  hasCapiScope: true,
  auth: {
    version: "v23.0",
    tokens: { accessToken: "token-1" },
    metadata: { wabaId: "waba-1" },
  },
}

describe("handleSendConversionEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findWorkspaceEvent.mockResolvedValue(pendingEvent)
    mocks.findWorkspaceIntegration.mockResolvedValue(integration)
    mocks.ensureDatasetId.mockResolvedValue("dataset-1")
    mocks.sendConversionEvent.mockResolvedValue(undefined)
    mocks.updateCapiStatus.mockResolvedValue({ id: "ace-1" })
  })

  test("sends a pending event and marks it sent", async () => {
    await handleSendConversionEvent(jobData)

    expect(mocks.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
    expect(mocks.ensureDatasetId).toHaveBeenCalledWith({
      id: "iw-1",
      workspaceId: "ws-1",
      provision: expect.any(Function),
    })
    expect(mocks.sendConversionEvent).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      accessToken: "token-1",
      version: "v23.0",
      event: {
        eventType: "purchase",
        occurredAt: pendingEvent.occurredAt,
        sourceEventId: "source-1",
        ctwaClid: "clid-1",
        wabaId: "waba-1",
        currency: "USD",
        value: "12.34",
      },
    })
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "sent",
      capiSentAt: expect.any(Date),
    })
  })

  test("skips when the integration lacks CAPI scope", async () => {
    mocks.findWorkspaceIntegration.mockResolvedValue({
      ...integration,
      hasCapiScope: false,
    })

    await handleSendConversionEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "skipped_no_scope",
    })
    expect(mocks.ensureDatasetId).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })

  test("marks terminal failures failed and logs them", async () => {
    mocks.sendConversionEvent.mockRejectedValue(new Error("invalid token"))

    await handleSendConversionEvent(jobData)

    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
    expect(mocks.defaultQueueAdd).toHaveBeenCalledWith("sendErrorLog", {
      type: "sendErrorLog",
      data: {
        workspaceId: "ws-1",
        error: {
          message: "invalid token",
          stack: expect.any(String),
          httpCode: "400",
        },
      },
    })
  })

  test("throws retryable failures so BullMQ retries", async () => {
    const retryableError = Object.assign(new Error("rate limited"), {
      retryable: true,
    })
    mocks.sendConversionEvent.mockRejectedValue(retryableError)

    await expect(handleSendConversionEvent(jobData)).rejects.toThrow(
      "rate limited",
    )

    expect(mocks.updateCapiStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed" }),
    )
  })

  test("marks failed when dataset provisioning fails terminally", async () => {
    mocks.ensureDatasetId.mockRejectedValue(new Error("dataset forbidden"))

    await handleSendConversionEvent(jobData)

    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).toHaveBeenCalledWith({
      id: "ace-1",
      workspaceId: "ws-1",
      from: "pending",
      to: "failed",
    })
  })

  test("rethrows retryable dataset provisioning errors for retry", async () => {
    const retryableError = Object.assign(new Error("dataset rate limited"), {
      retryable: true,
    })
    mocks.ensureDatasetId.mockRejectedValue(retryableError)

    await expect(handleSendConversionEvent(jobData)).rejects.toThrow(
      "dataset rate limited",
    )
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
    expect(mocks.updateCapiStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed" }),
    )
  })

  test("completes when the conditional sent update loses", async () => {
    mocks.updateCapiStatus.mockResolvedValue(null)

    await expect(handleSendConversionEvent(jobData)).resolves.toBeUndefined()
  })

  test("missing event is a no-op", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue(null)

    await handleSendConversionEvent(jobData)

    expect(mocks.findWorkspaceIntegration).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })

  test("non-pending event is a no-op", async () => {
    mocks.findWorkspaceEvent.mockResolvedValue({
      ...pendingEvent,
      capiStatus: "sent",
    })

    await handleSendConversionEvent(jobData)

    expect(mocks.findWorkspaceIntegration).not.toHaveBeenCalled()
    expect(mocks.sendConversionEvent).not.toHaveBeenCalled()
  })
})
