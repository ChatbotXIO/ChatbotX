import { beforeEach, describe, expect, test, vi } from "vitest"

const { integrationQueueAddBulk, loggerInfo, loggerWarn, smartDelayService } =
  vi.hoisted(() => ({
    integrationQueueAddBulk: vi.fn(),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    smartDelayService: {
      claimForRun: vi.fn(),
      claimDueRows: vi.fn(),
      resetToPending: vi.fn(),
      sweepStuckScheduled: vi.fn(),
    },
  }))

vi.mock("@chatbotx.io/business/smart-delay", () => ({ smartDelayService }))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    resumeFollowUp: "resumeFollowUp",
    resumeWait: "resumeWait",
    sendFlow: "sendFlow",
  },
  integrationQueue: {
    add: vi.fn(),
    addBulk: integrationQueueAddBulk,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: loggerInfo,
    warn: loggerWarn,
  },
}))

const { scanSmartDelay } = await import(
  "../src/schedule/handlers/scan-smart-delay"
)

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "row-1",
  workspaceId: "workspace-1",
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  contactInboxId: "contact-inbox-1",
  conversationId: "conversation-1",
  nodeId: "next-node",
  stepId: "step-1",
  type: "waitNode",
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  triggerAt: new Date("2026-07-16T00:01:00.000Z"),
  status: "scheduled",
  ...overrides,
})

describe("scanSmartDelay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"))
    smartDelayService.sweepStuckScheduled.mockResolvedValue(0)
    smartDelayService.claimForRun.mockResolvedValue(true)
    integrationQueueAddBulk.mockResolvedValue(undefined)
  })

  test("returns zero counts when no smart-delay rows are due", async () => {
    smartDelayService.claimDueRows.mockResolvedValueOnce([])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 0, enqueued: 0 })
    expect(smartDelayService.sweepStuckScheduled).toHaveBeenCalledWith({
      olderThan: new Date("2026-07-15T23:50:00.000Z"),
    })
    expect(integrationQueueAddBulk).not.toHaveBeenCalled()
  })

  test("logs and resets stuck scheduled rows before claiming due rows", async () => {
    smartDelayService.sweepStuckScheduled.mockResolvedValueOnce(3)
    smartDelayService.claimDueRows.mockResolvedValueOnce([])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 0, enqueued: 0 })

    expect(loggerWarn).toHaveBeenCalledWith(
      { count: 3 },
      "Reset stuck scheduled smart delay rows to pending",
    )
  })

  test("enqueues wait rows as resumeWait and follow-up rows as resumeFollowUp", async () => {
    smartDelayService.claimDueRows.mockResolvedValueOnce([
      makeRow({ id: "wait-row", type: "waitNode" }),
      makeRow({ id: "follow-up-row", type: "followUp" }),
    ])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 2, enqueued: 2 })

    expect(smartDelayService.claimDueRows).toHaveBeenCalledWith({
      windowUntil: new Date("2026-07-16T00:05:59.999Z"),
    })
    expect(integrationQueueAddBulk).toHaveBeenCalledWith([
      {
        name: "resumeWait",
        data: {
          type: "resumeWait",
          data: { smartDelayId: "wait-row" },
        },
        opts: { jobId: "smart-delay-wait-row-1784160060000", delay: 60_000 },
      },
      {
        name: "resumeFollowUp",
        data: {
          type: "resumeFollowUp",
          data: { smartDelayId: "follow-up-row" },
        },
        opts: {
          jobId: "smart-delay-follow-up-row-1784160060000",
          delay: 60_000,
        },
      },
    ])
  })

  test("resets a failed enqueue batch to pending", async () => {
    smartDelayService.claimDueRows.mockResolvedValueOnce([
      makeRow({ id: "failed-row" }),
    ])
    integrationQueueAddBulk.mockRejectedValueOnce(new Error("redis down"))

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 1, enqueued: 0 })
    expect(smartDelayService.resetToPending).toHaveBeenCalledWith({
      ids: ["failed-row"],
    })
  })

  test("logs terminal rows without enqueueing them", async () => {
    smartDelayService.claimDueRows.mockResolvedValueOnce([
      makeRow({ id: "terminal-row", nodeId: null }),
    ])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 1, enqueued: 0 })
    expect(loggerInfo).toHaveBeenCalledWith(
      { ids: ["terminal-row"] },
      "Smart delay rows without nodeId marked completed (terminal wait)",
    )
    expect(smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "terminal-row",
      to: "completed",
    })
    expect(integrationQueueAddBulk).not.toHaveBeenCalled()
  })
})
