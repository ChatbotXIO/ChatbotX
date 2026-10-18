import { describe, expect, test } from "vitest"
import { sendFlowStep } from "../src/handlers/message"

describe("webchat sendFlowStep", () => {
  test("reports one accepted message even though delivery happens outside this handler", async () => {
    // The worker delivers webchat flow steps through publishGuestRealtimeEvent
    // in apps/worker/src/chat/handlers/send-flow-step.ts. This handler is a
    // no-op but must still report the send for bot-message quota and analytics.
    await expect(sendFlowStep()).resolves.toEqual({
      messageIds: [],
      sentCount: 1,
    })
  })
})
