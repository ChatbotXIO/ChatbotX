import { describe, expect, test } from "vitest"
import { CALL_ASSIGNMENT_TRIGGER_HANDLERS } from "../src/whatsapp-call/call-assignment-triggers"

describe("CALL_ASSIGNMENT_TRIGGER_HANDLERS", () => {
  test("declares exactly the two auto-assign call sites (answered, dialed)", () => {
    expect(Object.keys(CALL_ASSIGNMENT_TRIGGER_HANDLERS).sort()).toEqual([
      "answered",
      "dialed",
    ])
  })

  // Each `triggerHandler` value flows into the conversation-assigned
  // analytics event (`emit("analytics:dashboard", ...)`) as the identifier
  // of what fired the assignment — two call sites resolving to the same
  // string would make the answer and dial paths indistinguishable there.
  test("every triggerHandler value is a distinct, non-empty string", () => {
    const values = Object.values(CALL_ASSIGNMENT_TRIGGER_HANDLERS)

    for (const value of values) {
      expect(typeof value).toBe("string")
      expect(value.length).toBeGreaterThan(0)
    }
    expect(new Set(values).size).toBe(values.length)
  })
})
