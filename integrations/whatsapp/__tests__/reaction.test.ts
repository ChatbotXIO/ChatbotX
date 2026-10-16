import { describe, expect, test } from "vitest"
import { readWhatsappReaction } from "../src/lib/reaction"

describe("readWhatsappReaction", () => {
  test("reads a reaction's target message id and emoji", () => {
    expect(
      readWhatsappReaction({
        id: "wamid.reaction",
        type: "reaction",
        reaction: { message_id: "wamid.target", emoji: "❤️" },
      }),
    ).toEqual({ messageId: "wamid.target", action: "react", emoji: "❤️" })
  })

  test("an empty emoji means the reaction was removed", () => {
    expect(
      readWhatsappReaction({
        type: "reaction",
        reaction: { message_id: "wamid.target", emoji: "" },
      }),
    ).toEqual({ messageId: "wamid.target", action: "unreact" })
  })

  test("ignores non-reaction and malformed items", () => {
    expect(readWhatsappReaction({ type: "text", text: { body: "hi" } })).toBe(
      null,
    )
    expect(readWhatsappReaction({ type: "reaction", reaction: {} })).toBe(null)
    expect(readWhatsappReaction(null)).toBe(null)
  })
})
