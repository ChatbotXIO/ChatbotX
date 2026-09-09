import type {
  MessageDeliveredPayload,
  MessageSeenPayload,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findDispatchesForUpdate = vi.fn()
const findCompletedUnseenDispatches = vi.fn()
const updateOccurredAtBulk = vi.fn()

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("../src/repositories/postgres", () => ({
  sequenceStatsRepository: {
    findCompletedUnseenDispatches,
    findDispatchesForUpdate,
    findSequenceStepsByIds: vi.fn(),
    getContacts: vi.fn(),
    getStepStats: vi.fn(),
    updateFailedBulk: vi.fn(),
    updateOccurredAtBulk,
  },
}))

const deliveredPayload = {
  context: {
    workspaceId: "w1",
  },
  metadata: {
    type: "sequenceSchedule",
    sequenceId: "s1",
    sequenceStepId: "step1",
    contactInboxId: "ci1",
  },
  occurredAt: new Date("2026-06-01T00:00:00.000Z"),
} as unknown as MessageDeliveredPayload

const seenPayload = {
  context: {
    workspaceId: "w1",
    contactInboxId: "ci1",
  },
  metadata: {},
  occurredAt: new Date("2026-06-01T00:00:00.000Z"),
} as unknown as MessageSeenPayload

beforeEach(() => {
  findDispatchesForUpdate.mockReset()
  findCompletedUnseenDispatches.mockReset()
  updateOccurredAtBulk.mockReset().mockResolvedValue(undefined)
})

describe("SequenceAnalyticsService dispatch updates", () => {
  test("updates delivered dispatches by id + workspaceId without guessing status", async () => {
    findDispatchesForUpdate.mockResolvedValue([
      {
        id: "d1",
        workspaceId: "w1",
        sequenceId: "s1",
        stepId: "step1",
        contactInboxId: "ci1",
      },
    ])
    const { sequenceAnalyticsService } = await import(
      "../src/services/sequence-analytics.service"
    )

    await sequenceAnalyticsService.onDelivered([deliveredPayload])

    expect(findDispatchesForUpdate).toHaveBeenCalledWith({
      workspaceIds: ["w1"],
      sequenceIds: ["s1"],
      stepIds: ["step1"],
      contactInboxIds: ["ci1"],
      knownStatus: undefined,
    })
    expect(updateOccurredAtBulk).toHaveBeenCalledTimes(1)
    const [items, updateField, knownStatus] = updateOccurredAtBulk.mock.calls[0]
    expect(updateField).toBe("deliveredAt")
    expect(knownStatus).toBeUndefined()
    expect(items).toEqual([
      expect.objectContaining({ id: "d1", workspaceId: "w1" }),
    ])
  })

  test("adds status predicate only when caller selected completed dispatches", async () => {
    findCompletedUnseenDispatches.mockResolvedValueOnce([
      {
        sequenceId: "s1",
        stepId: "step1",
        contactInboxId: "ci1",
      },
    ])
    findDispatchesForUpdate.mockResolvedValueOnce([
      {
        id: "d1",
        workspaceId: "w1",
        sequenceId: "s1",
        stepId: "step1",
        contactInboxId: "ci1",
      },
    ])
    const { sequenceAnalyticsService } = await import(
      "../src/services/sequence-analytics.service"
    )

    await sequenceAnalyticsService.onSeen([seenPayload])

    expect(findCompletedUnseenDispatches).toHaveBeenCalledWith({
      workspaceId: "w1",
      contactInboxIds: ["ci1"],
    })
    expect(findDispatchesForUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceIds: ["w1"],
        knownStatus: "completed",
      }),
    )
    expect(updateOccurredAtBulk).toHaveBeenCalledTimes(1)
    const [items, updateField, knownStatus] = updateOccurredAtBulk.mock.calls[0]
    expect(updateField).toBe("seenAt")
    expect(knownStatus).toBe("completed")
    expect(items).toEqual([
      expect.objectContaining({ id: "d1", workspaceId: "w1" }),
    ])
  })
})
