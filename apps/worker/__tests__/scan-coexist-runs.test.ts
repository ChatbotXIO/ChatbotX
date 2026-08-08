import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockFindIntegrationForCoexist,
  mockMarkFailed,
  mockMarkMaxAttemptsFailed,
  mockPickDueRuns,
  mockQueueAdd,
} = vi.hoisted(() => ({
  mockFindIntegrationForCoexist: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockMarkMaxAttemptsFailed: vi.fn(),
  mockPickDueRuns: vi.fn(),
  mockQueueAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistJobStrategies: {
    messenger: { mode: "pull", action: "coexistMessengerSync" },
    instagram: { mode: "pull", action: "coexistInstagramSync" },
    whatsapp: { mode: "buffered", action: "coexistWhatsappFlush" },
  },
  coexistService: {
    findIntegrationForCoexist: mockFindIntegrationForCoexist,
    markFailed: mockMarkFailed,
    markMaxAttemptsFailed: mockMarkMaxAttemptsFailed,
    pickDueRuns: mockPickDueRuns,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    coexistWhatsappFlush: "coexistWhatsappFlush",
    coexistMessengerSync: "coexistMessengerSync",
    coexistInstagramSync: "coexistInstagramSync",
  },
  integrationQueue: { add: mockQueueAdd },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { scanCoexistRuns } from "../src/schedule/handlers/scan-coexist-runs"

const whatsappRun = {
  id: "run-wa-1",
  attempts: 1,
  channel: "whatsapp" as const,
  integrationId: "int-wa-1",
  workspaceId: "ws-1",
}

const messengerRun = {
  id: "run-ms-1",
  attempts: 2,
  channel: "messenger" as const,
  integrationId: "int-ms-1",
  workspaceId: "ws-2",
}

const instagramRun = {
  id: "run-ig-1",
  attempts: 3,
  channel: "instagram" as const,
  integrationId: "int-ig-1",
  workspaceId: "ws-3",
}

describe("scanCoexistRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMarkMaxAttemptsFailed.mockResolvedValue(undefined)
    mockMarkFailed.mockResolvedValue(undefined)
    mockQueueAdd.mockResolvedValue(undefined)
  })

  it("marks max-attempt rows before picking due runs", async () => {
    mockPickDueRuns.mockResolvedValue([])

    await scanCoexistRuns()

    expect(mockMarkMaxAttemptsFailed).toHaveBeenCalledWith({ maxAttempts: 5 })
    expect(mockPickDueRuns).toHaveBeenCalledWith({
      batchSize: 500,
      maxAttempts: 5,
    })
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  it("enqueues Messenger and Instagram pull sync runs", async () => {
    mockPickDueRuns.mockResolvedValue([messengerRun, instagramRun])

    await scanCoexistRuns()

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "coexistMessengerSync",
      {
        type: "coexistMessengerSync",
        data: {
          runId: "run-ms-1",
          integrationId: "int-ms-1",
          workspaceId: "ws-2",
        },
      },
      expect.objectContaining({ jobId: "coexist-run-run-ms-1-2" }),
    )
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "coexistInstagramSync",
      {
        type: "coexistInstagramSync",
        data: {
          runId: "run-ig-1",
          integrationId: "int-ig-1",
          workspaceId: "ws-3",
        },
      },
      expect.objectContaining({ jobId: "coexist-run-run-ig-1-3" }),
    )
  })

  it("enqueues WhatsApp flush with the resolved phone number id", async () => {
    mockPickDueRuns.mockResolvedValue([whatsappRun])
    mockFindIntegrationForCoexist.mockResolvedValue({
      channel: "whatsapp",
      phoneNumberId: "phone-123",
    })

    await scanCoexistRuns()

    expect(mockFindIntegrationForCoexist).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-wa-1",
      channel: "whatsapp",
    })
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "coexistWhatsappFlush",
      {
        type: "coexistWhatsappFlush",
        data: { runId: "run-wa-1", phoneNumberId: "phone-123" },
      },
      expect.objectContaining({ jobId: "coexist-run-run-wa-1-1" }),
    )
  })

  it("marks a WhatsApp run failed when phoneNumberId is missing", async () => {
    mockPickDueRuns.mockResolvedValue([whatsappRun])
    mockFindIntegrationForCoexist.mockResolvedValue({
      channel: "whatsapp",
      phoneNumberId: null,
    })

    await scanCoexistRuns()

    expect(mockMarkFailed).toHaveBeenCalledWith({
      runId: "run-wa-1",
      currentError: "integration missing phoneNumberId",
    })
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })
})
