// @vitest-environment node
import { createTranslator } from "next-intl"
import { describe, expect, test } from "vitest"
import ar from "../messages/ar.json"
import de from "../messages/de.json"
import en from "../messages/en.json"
import vi from "../messages/vi.json"

type ParticipantMessages = {
  conversationParticipants: { joinedShort: string }
}

// Only the message under test is handed to the translator: the full locale
// files are too large a type for `createTranslator` to infer keys from.
const joinedShort = (
  locale: string,
  { conversationParticipants }: ParticipantMessages,
  names: string,
  count: number,
) =>
  createTranslator({
    locale,
    messages: {
      conversationParticipants: {
        joinedShort: conversationParticipants.joinedShort,
      },
    },
    namespace: "conversationParticipants",
  })("joinedShort", { count, names })

describe("conversationParticipants.joinedShort", () => {
  test("agrees with the number of members where the language needs it", () => {
    expect(joinedShort("de", de, "Hung", 1)).toBe("Hung ist beigetreten")
    expect(joinedShort("de", de, "Hung, Phong", 2)).toBe(
      "Hung, Phong sind beigetreten",
    )
  })

  test("uses the Arabic dual for exactly two members", () => {
    expect(joinedShort("ar", ar, "علي", 1)).toBe("علي انضم")
    expect(joinedShort("ar", ar, "علي، عمر", 2)).toBe("علي، عمر انضما")
    expect(joinedShort("ar", ar, "علي، عمر، سعيد", 3)).toBe(
      "علي، عمر، سعيد انضموا",
    )
  })

  test("keeps one form where the verb does not change", () => {
    expect(joinedShort("en", en, "Hung", 1)).toBe("Hung joined")
    expect(joinedShort("en", en, "Hung, Phong", 2)).toBe("Hung, Phong joined")
    expect(joinedShort("vi", vi, "Hung, Phong", 2)).toBe(
      "Hung, Phong đã tham gia",
    )
  })
})
