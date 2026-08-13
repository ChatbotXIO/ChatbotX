import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByPhoneNumberId: vi.fn(),
  ingestAutomaticEvent: vi.fn(),
  enqueueIntegrationJob: vi.fn(),
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: string | undefined, fn: () => Promise<void>) =>
      await fn(),
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    ingestAutomaticEvent: mocks.ingestAutomaticEvent,
  },
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByPhoneNumberId: mocks.findByPhoneNumberId,
  },
}))

vi.mock("@chatbotx.io/worker-config", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/worker-config")
  >("@chatbotx.io/worker-config")
  return {
    ...actual,
    enqueueIntegrationJob: mocks.enqueueIntegrationJob,
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { handleAdsAutomaticEvent } = await import(
  "../src/integration/handlers/ads-automatic-event"
)

const jobData = {
  integrationType: "whatsapp" as const,
  integrationIdentifier: "phone-1",
  phoneNumberId: "phone-1",
  wabaId: "waba-1",
  payload: {
    event_name: "LeadSubmitted" as const,
    id: "wamid.lead-1",
    timestamp: "1800000000",
    ctwa_clid: "clid-1",
  },
}

describe("handleAdsAutomaticEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByPhoneNumberId.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
      phoneNumberId: "phone-1",
      wabaId: "waba-1",
    })
    mocks.ingestAutomaticEvent.mockResolvedValue({
      id: "event-1",
      workspaceId: "ws-1",
      eventType: "lead",
    })
  })

  test("maps the job to ads conversion ingestion with integration attribution", async () => {
    await handleAdsAutomaticEvent(jobData)

    expect(mocks.findByPhoneNumberId).toHaveBeenCalledWith({
      phoneNumberId: "phone-1",
      wabaId: "waba-1",
    })
    expect(mocks.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
    expect(mocks.ingestAutomaticEvent).toHaveBeenCalledWith({
      integrationWhatsappId: "iw-1",
      wabaId: "waba-1",
      workspaceId: "ws-1",
      payload: jobData.payload,
    })
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: {
          adsConversionEventId: "event-1",
          workspaceId: "ws-1",
        },
      },
      { jobId: "ads-conversion-send-event-1" },
    )
    expect(mocks.enqueueIntegrationJob.mock.calls[0][1].jobId).not.toContain(
      ":",
    )
  })

  test("duplicate insert returning null still completes", async () => {
    mocks.ingestAutomaticEvent.mockResolvedValue(null)

    await expect(handleAdsAutomaticEvent(jobData)).resolves.toBeUndefined()
    expect(mocks.enqueueIntegrationJob).not.toHaveBeenCalled()
  })
})
