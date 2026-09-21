import { describe, expect, test } from "vitest"
import { sendFlowStep } from "../src/handlers/message"

describe("webchat sendFlowStep", () => {
  test("reports one accepted message even though delivery happens outside this handler", async () => {
    // The worker delivers webchat flow steps itself via broadcastToGuestParty
    // (apps/worker/src/chat/handlers/send-flow-step.ts) — this handler is a
    // no-op, but it must still report the send so bot-message quota/analytics
    // count it.
    await expect(sendFlowStep()).resolves.toEqual({
      messageIds: [],
      sentCount: 1,
    })
  })
})
