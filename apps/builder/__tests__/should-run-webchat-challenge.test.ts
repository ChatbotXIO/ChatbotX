import { describe, expect, test } from "vitest"
import { shouldRunWebchatChallenge } from "@/features/messages/lib/should-run-webchat-challenge"

const quickReplyChallenge = {
  type: "quickReply" as const,
  data: {
    flowId: "f",
    nodeId: "n",
    attempts: 0,
    maxRetries: 3,
    sentAt: new Date(),
  },
}
const stepChallenge = {
  type: "step" as const,
  data: {
    flowId: "f",
    nodeId: "n",
    stepId: "s",
    attempts: 0,
    lastAttemptAt: new Date(),
  },
}

describe("shouldRunWebchatChallenge", () => {
  test("no challenge → false", () => {
    expect(shouldRunWebchatChallenge(undefined, false)).toBe(false)
  })
  test("free text with a quick reply retry pending → true", () => {
    expect(shouldRunWebchatChallenge(quickReplyChallenge, false)).toBe(true)
  })
  test("a quick reply tap never counts as a non quick reply answer", () => {
    expect(shouldRunWebchatChallenge(quickReplyChallenge, true)).toBe(false)
  })
  test("Get User Data keeps its existing behaviour for postbacks", () => {
    expect(shouldRunWebchatChallenge(stepChallenge, true)).toBe(true)
  })
})
