import { describe, expect, test } from "vitest"
import {
  isConversationTranslationOn,
  readConversationTranslation,
  withoutTranslationTurnedOn,
} from "@/features/translation/lib/conversation-translation"

describe("isConversationTranslationOn", () => {
  test.each([
    // [enabledOverride, botOnDuty, expected]
    [null, false, true],
    [null, true, false],
    [true, false, true],
    [true, true, true],
    [false, false, false],
    [false, true, false],
  ] as const)("override %s, bot on duty %s -> %s", (enabledOverride, botOnDuty, expected) => {
    expect(isConversationTranslationOn({ enabledOverride, botOnDuty })).toBe(
      expected,
    )
  })

  test("taking the bot over keeps translation off until an agent turns it on", () => {
    // Bot active, then paused by an agent (bot resumes later): both on duty.
    expect(
      isConversationTranslationOn({ enabledOverride: null, botOnDuty: true }),
    ).toBe(false)
    expect(
      isConversationTranslationOn({ enabledOverride: true, botOnDuty: true }),
    ).toBe(true)
  })
})

describe("withoutTranslationTurnedOn", () => {
  test("drops an agent's 'on' and keeps the language and other keys", () => {
    const next = withoutTranslationTurnedOn({
      challenge: { type: "step" },
      translation: {
        enabledOverride: true,
        language: "es",
        languageSource: "manual",
      },
    })
    expect(next).toEqual({
      challenge: { type: "step" },
      translation: { language: "es", languageSource: "manual" },
    })
    expect(
      readConversationTranslation({ additionalAttributes: next })
        .enabledOverride,
    ).toBeNull()
  })

  test("keeps an agent's 'off'", () => {
    const attributes = { translation: { enabledOverride: false } }
    expect(withoutTranslationTurnedOn(attributes)).toBe(attributes)
  })
})
