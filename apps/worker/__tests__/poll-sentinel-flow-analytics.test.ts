import {
  flowAnalyticsService,
  flowStatsRepository,
} from "@chatbotx.io/analytics"
import { afterEach, describe, expect, test, vi } from "vitest"

const payload = (extra: Record<string, unknown>) =>
  ({
    context: {
      workspaceId: "w1",
      contactId: "c1",
      contactInboxId: "ci1",
      conversationId: "conv1",
      channel: "messenger",
    },
    action: { flowId: "0" },
    occurredAt: new Date(),
    ...extra,
  }) as never

describe("flowAnalyticsService with the poll sentinel flow id", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("a poll message (no nodeId) resolves and writes nothing", async () => {
    const lookup = vi.spyOn(
      flowStatsRepository,
      "findAnalyticsSessionsByFlowIds",
    )
    const insert = vi.spyOn(flowStatsRepository, "insertNodeStats")
    await expect(
      flowAnalyticsService.onMessageSent([payload({})]),
    ).resolves.toBeUndefined()
    expect(lookup).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  test("even with a nodeId, flowId '0' has no analytics session and writes nothing", async () => {
    vi.spyOn(
      flowStatsRepository,
      "findAnalyticsSessionsByFlowIds",
    ).mockResolvedValue([])
    const insert = vi.spyOn(flowStatsRepository, "insertNodeStats")
    await expect(
      flowAnalyticsService.onMessageSent([payload({ nodeId: "n1" })]),
    ).resolves.toBeUndefined()
    expect(insert).not.toHaveBeenCalled()
  })
})
