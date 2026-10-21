import { describe, expect, test } from "vitest"
import { queueNames } from "../src/lib/types"
import {
  MarketingMessageJobAction,
  marketingMessageCampaignJobId,
} from "../src/queues/marketing-message"

describe("marketing message queue", () => {
  test("has its own queue name, separate from the shared schedule queue", () => {
    expect(queueNames.enum.marketingMessage).toBe("marketingMessage")
    expect(MarketingMessageJobAction.processCampaign).toBe("processCampaign")
  })

  test("the per-campaign job id is deterministic per step and BullMQ-safe", () => {
    const id = marketingMessageCampaignJobId("c1", "dispatch")
    expect(id).toBe("mm-campaign-dispatch-c1")
    expect(id).not.toContain(":")
  })
})
