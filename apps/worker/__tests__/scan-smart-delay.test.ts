import { beforeEach, describe, expect, test, vi } from "vitest"

const { integrationQueueAddBulk, loggerInfo, smartDelayService } = vi.hoisted(
  () => ({
    integrationQueueAddBulk: vi.fn(),
    loggerInfo: vi.fn(),
    smartDelayService: {
      claimDueRows: vi.fn(),
      resetToPending: vi.fn(),
    },
  }),
)

vi.mock("@chatbotx.io/business/smart-delay", () => ({ smartDelayService }))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    resumeFollowUp: "resumeFollowUp",
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
    warn: vi.fn(),
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
  status: "completed",
  ...overrides,
})

describe("scanSmartDelay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"))
    integrationQueueAddBulk.mockResolvedValue(undefined)
  })

  test("returns zero counts when no smart-delay rows are due", async () => {
    smartDelayService.claimDueRows.mockResolvedValueOnce([])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 0, enqueued: 0 })
    expect(integrationQueueAddBulk).not.toHaveBeenCalled()
  })

  test("enqueues wait rows as sendFlow and follow-up rows as resumeFollowUp", async () => {
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
        name: "sendFlow",
        data: {
          type: "sendFlow",
          data: {
            conversationId: "conversation-1",
            contactInboxId: "contact-inbox-1",
            flowId: "flow-1",
            flowVersionId: "flow-version-1",
            nodeId: "next-node",
          },
        },
        opts: { jobId: "smart-delay-wait-row", delay: 60_000 },
      },
      {
        name: "resumeFollowUp",
        data: {
          type: "resumeFollowUp",
          data: { smartDelayId: "follow-up-row" },
        },
        opts: { jobId: "smart-delay-follow-up-row", delay: 60_000 },
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
    expect(integrationQueueAddBulk).not.toHaveBeenCalled()
  })
})
