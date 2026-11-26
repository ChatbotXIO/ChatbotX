import { describe, expect, test } from "vitest"
import { readSentTranslation } from "@/features/translation/lib/sent-translation"

describe("readSentTranslation", () => {
  test("a message that was not sent, with translation left on", () => {
    expect(
      readSentTranslation({
        translationNotSent: {
          reason: "timeout",
          conversationTranslation: "on",
        },
      }),
    ).toEqual({ kind: "notSent", turnedOff: false })
  })

  test("a message that was not sent because the AI provider failed", () => {
    expect(
      readSentTranslation({
        translationNotSent: {
          reason: "providerError",
          conversationTranslation: "off",
        },
      }),
    ).toEqual({ kind: "notSent", turnedOff: true })
  })

  test("a sent message, with or without its translation", () => {
    expect(readSentTranslation({ id: "m1" })).toEqual({
      kind: "sent",
      messageId: "m1",
      translation: null,
    })
  })

  test("anything else carries nothing", () => {
    expect(readSentTranslation(null)).toBeNull()
    expect(readSentTranslation({ translationNotSent: {} })).toBeNull()
  })
})
