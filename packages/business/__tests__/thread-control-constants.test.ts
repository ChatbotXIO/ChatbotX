import { describe, expect, test } from "vitest"
import {
  resolveThreadControlActivityText,
  THREAD_CONTROL_ACTIVITY_TEXT,
} from "../src/thread-control/constants"

describe("resolveThreadControlActivityText", () => {
  test("keeps the WhatsApp 'passed' wording (escalation partner) byte-for-byte", () => {
    expect(resolveThreadControlActivityText("passed", "whatsapp")).toBe(
      "Conversation passed to the escalation partner",
    )
  })

  test("uses neutral wording for a channel with no override", () => {
    const text = resolveThreadControlActivityText("passed", "webchat")
    expect(text).toBe(THREAD_CONTROL_ACTIVITY_TEXT.passed)
    expect(text).not.toContain("escalation")
  })

  test("falls back to the shared text for events a channel does not reword", () => {
    expect(resolveThreadControlActivityText("released", "whatsapp")).toBe(
      THREAD_CONTROL_ACTIVITY_TEXT.released,
    )
  })
})
