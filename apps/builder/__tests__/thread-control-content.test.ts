import { describe, expect, test } from "vitest"
import { getThreadControlContextCard } from "@/features/messages/lib/thread-control-content"

describe("getThreadControlContextCard", () => {
  test("parses a context-only card", () => {
    const card = getThreadControlContextCard({
      type: "threadControlContext",
      context: { type: "summary", text: "Wants a refund" },
    })

    expect(card?.context).toEqual({ type: "summary", text: "Wants a refund" })
    expect(card?.handoverNote).toBeUndefined()
  })

  test("parses a note-only card (handover from a standby-access owner, no context)", () => {
    const card = getThreadControlContextCard({
      type: "threadControlContext",
      handoverNote: "escalated by bot",
    })

    expect(card?.context).toBeUndefined()
    expect(card?.handoverNote).toBe("escalated by bot")
  })

  test("parses a card carrying both context and note", () => {
    const card = getThreadControlContextCard({
      type: "threadControlContext",
      context: { type: "summary", text: "Order 123" },
      handoverNote: "escalated by bot",
    })

    expect(card?.context).toEqual({ type: "summary", text: "Order 123" })
    expect(card?.handoverNote).toBe("escalated by bot")
  })

  test("rejects an empty card (neither context nor note)", () => {
    expect(
      getThreadControlContextCard({ type: "threadControlContext" }),
    ).toBeUndefined()
  })

  test("rejects an unrelated content payload", () => {
    expect(
      getThreadControlContextCard({ type: "somethingElse" }),
    ).toBeUndefined()
  })
})
