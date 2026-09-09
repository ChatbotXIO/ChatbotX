import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockCreateRun,
  mockFinalizeTimedOutWaitingRuns,
  mockFindIntegrationForCoexist,
  mockFindStranded,
  mockMarkFailed,
  mockMarkMaxAttemptsFailed,
  mockPickDueRuns,
  mockQueueAdd,
  mockReviveWaitingRuns,
} = vi.hoisted(() => ({
  mockCreateRun: vi.fn(),
  mockFinalizeTimedOutWaitingRuns: vi.fn(),
  mockFindIntegrationForCoexist: vi.fn(),
  mockFindStranded: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockMarkMaxAttemptsFailed: vi.fn(),
  mockPickDueRuns: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockReviveWaitingRuns: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistJobStrategies: {
    messenger: { mode: "pull", action: "coexistMessengerSync" },
    instagram: { mode: "pull", action: "coexistInstagramSync" },
    whatsapp: { mode: "buffered", action: "coexistWhatsappFlush" },
  },
  coexistService: {
    createRun: mockCreateRun,
    finalizeTimedOutWaitingRuns: mockFinalizeTimedOutWaitingRuns,
    findIntegrationForCoexist: mockFindIntegrationForCoexist,
    findStrandedCoexistWhatsappIntegrations: mockFindStranded,
    markFailed: mockMarkFailed,
    markMaxAttemptsFailed: mockMarkMaxAttemptsFailed,
    pickDueRuns: mockPickDueRuns,
    reviveWaitingRunsWithPendingStaging: mockReviveWaitingRuns,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  // Mirrors the real builders; they are pinned by
  // `packages/worker-config/__tests__/coexist-job-ids.test.ts`.
  buildCoexistRunJobId: ({
    runId,
    attempts,
    suffix,
  }: {
    runId: string
    attempts: number
    suffix?: string
  }) => `coexist-run-${runId}-${attempts}${suffix ?? ""}`,
  buildCoexistReviveJobSuffix: () => `-revive-${crypto.randomUUID()}`,
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

/**
 * Revive job ids carry a `-revive-<uuid>` suffix: a
 * process-local counter collided across two scheduler processes.
 */
const REVIVED_JOB_ID =
  /^coexist-run-run-revived-3-revive-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

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
    mockReviveWaitingRuns.mockResolvedValue([])
    mockFinalizeTimedOutWaitingRuns.mockResolvedValue([])
    mockFindStranded.mockResolvedValue([])
  })

  it("marks max-attempt rows before picking due runs", async () => {
    mockPickDueRuns.mockResolvedValue([])

    await scanCoexistRuns()

    expect(mockMarkMaxAttemptsFailed).toHaveBeenCalledWith({
      type: "coexist",
      maxAttempts: 5,
    })
    expect(mockPickDueRuns).toHaveBeenCalledWith({
      type: "coexist",
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

  // ───────────────────────────────────────────────────────────────────────────
  // WhatsApp history-lifecycle recovery (brief-coexist-history-lifecycle.md §C)
  // ───────────────────────────────────────────────────────────────────────────

  describe("WhatsApp recovery pass", () => {
    // The shared scheduler must not name a channel. Recovery is
    // a per-channel STRATEGY (`coexistRecoveryStrategies`); only WhatsApp has
    // one today, and the scheduler simply iterates the table.
    it("recovery runs from the strategy table — exactly one pass, and it is WhatsApp's", async () => {
      await scanCoexistRuns()

      expect(mockReviveWaitingRuns).toHaveBeenCalledTimes(1)
      expect(mockFinalizeTimedOutWaitingRuns).toHaveBeenCalledTimes(1)
      expect(mockFindStranded).toHaveBeenCalledTimes(1)
    })

    it("runs the three recovery queries BEFORE picking due runs", async () => {
      const order: string[] = []
      mockReviveWaitingRuns.mockImplementation(() => {
        order.push("revive")
        return Promise.resolve([])
      })
      mockFinalizeTimedOutWaitingRuns.mockImplementation(() => {
        order.push("timeout")
        return Promise.resolve([])
      })
      mockFindStranded.mockImplementation(() => {
        order.push("stranded")
        return Promise.resolve([])
      })
      mockPickDueRuns.mockImplementation(() => {
        order.push("pick")
        return Promise.resolve([])
      })

      await scanCoexistRuns()

      expect(order).toEqual(["revive", "timeout", "stranded", "pick"])
    })

    it("creates a scheduler-recovery run for a stranded integration and enqueues it", async () => {
      mockPickDueRuns.mockResolvedValue([])
      mockFindStranded.mockResolvedValue([
        { integrationId: "int-wa-9", workspaceId: "ws-9" },
      ])
      mockCreateRun.mockResolvedValue({
        id: "run-recovered",
        attempts: 0,
        channel: "whatsapp",
        integrationId: "int-wa-9",
        workspaceId: "ws-9",
      })
      mockFindIntegrationForCoexist.mockResolvedValue({
        channel: "whatsapp",
        phoneNumberId: "phone-999",
      })

      await scanCoexistRuns()

      expect(mockCreateRun).toHaveBeenCalledWith({
        workspaceId: "ws-9",
        integrationId: "int-wa-9",
        channel: "whatsapp",
        triggerSource: "scheduler-recovery",
      })
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "coexistWhatsappFlush",
        {
          type: "coexistWhatsappFlush",
          data: { runId: "run-recovered", phoneNumberId: "phone-999" },
        },
        expect.objectContaining({ jobId: "coexist-run-run-recovered-0" }),
      )
    })

    // The revive is not a retry, so the recovery pass enqueues the
    // run itself with its CURRENT attempts. `pickDueRuns` (which increments
    // attempts) must not be what starts it — otherwise five history bursts
    // while a run is `waiting` drive it to "Max scheduler retries exceeded".
    it("enqueues a revived run itself, with its current attempts", async () => {
      mockPickDueRuns.mockResolvedValue([])
      mockReviveWaitingRuns.mockResolvedValue([
        {
          id: "run-revived",
          attempts: 3,
          channel: "whatsapp",
          integrationId: "int-wa-1",
          workspaceId: "ws-1",
        },
      ])
      mockFindIntegrationForCoexist.mockResolvedValue({
        channel: "whatsapp",
        phoneNumberId: "phone-123",
      })

      await scanCoexistRuns()

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "coexistWhatsappFlush",
        {
          type: "coexistWhatsappFlush",
          data: { runId: "run-revived", phoneNumberId: "phone-123" },
        },
        // attempts unchanged at 3 — no increment for a revive. The id carries a
        // `-revive-<n>` suffix so a retained FAILED job with the plain id
        // cannot swallow the add.
        expect.objectContaining({
          jobId: expect.stringMatching(REVIVED_JOB_ID),
        }),
      )
      // pickDueRuns returned nothing, so the enqueue cannot have come from it.
      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
    })

    it("two revives of the same run in different ticks use distinct job ids", async () => {
      mockPickDueRuns.mockResolvedValue([])
      mockReviveWaitingRuns.mockResolvedValue([
        {
          id: "run-revived",
          attempts: 0,
          channel: "whatsapp",
          integrationId: "int-wa-1",
          workspaceId: "ws-1",
        },
      ])
      mockFindIntegrationForCoexist.mockResolvedValue({
        channel: "whatsapp",
        phoneNumberId: "phone-123",
      })

      await scanCoexistRuns()
      await scanCoexistRuns()

      const jobIds = mockQueueAdd.mock.calls.map(
        (args) => (args[2] as Record<string, unknown> | undefined)?.jobId,
      )
      expect(jobIds).toHaveLength(2)
      expect(new Set(jobIds).size).toBe(2)
    })

    it("a revive that cannot resolve its phone number does not abort the tick", async () => {
      mockReviveWaitingRuns.mockResolvedValue([
        {
          id: "run-revived",
          attempts: 0,
          channel: "whatsapp",
          integrationId: "int-wa-1",
          workspaceId: "ws-1",
        },
      ])
      mockFindIntegrationForCoexist.mockResolvedValue({
        channel: "whatsapp",
        phoneNumberId: null,
      })
      mockPickDueRuns.mockResolvedValue([messengerRun])

      await scanCoexistRuns()

      expect(mockMarkFailed).toHaveBeenCalledWith({
        runId: "run-revived",
        currentError: "integration missing phoneNumberId",
      })
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "coexistMessengerSync",
        expect.anything(),
        expect.anything(),
      )
    })

    it("does not create a run when no integration is stranded (idempotent tick)", async () => {
      mockPickDueRuns.mockResolvedValue([])

      await scanCoexistRuns()

      expect(mockCreateRun).not.toHaveBeenCalled()
    })

    it("still picks due runs when a recovery query throws", async () => {
      mockReviveWaitingRuns.mockRejectedValue(new Error("db down"))
      mockPickDueRuns.mockResolvedValue([messengerRun])

      await scanCoexistRuns()

      expect(mockPickDueRuns).toHaveBeenCalled()
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "coexistMessengerSync",
        expect.anything(),
        expect.anything(),
      )
    })

    it("a failed createRun for one integration does not block the others", async () => {
      mockPickDueRuns.mockResolvedValue([])
      mockFindStranded.mockResolvedValue([
        { integrationId: "int-a", workspaceId: "ws-a" },
        { integrationId: "int-b", workspaceId: "ws-b" },
      ])
      mockCreateRun
        .mockRejectedValueOnce(new Error("conflict"))
        .mockResolvedValueOnce({
          id: "run-b",
          attempts: 0,
          channel: "whatsapp",
          integrationId: "int-b",
          workspaceId: "ws-b",
        })
      mockFindIntegrationForCoexist.mockResolvedValue({
        channel: "whatsapp",
        phoneNumberId: "phone-b",
      })

      await scanCoexistRuns()

      expect(mockCreateRun).toHaveBeenCalledTimes(2)
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "coexistWhatsappFlush",
        expect.objectContaining({
          data: { runId: "run-b", phoneNumberId: "phone-b" },
        }),
        expect.anything(),
      )
    })
  })
})
