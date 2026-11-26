// @vitest-environment node

import { postWriterProviders } from "@chatbotx.io/ai/post-writer"
import { socialProviders } from "@chatbotx.io/utils/social-account"
import { describe, expect, test } from "vitest"
import {
  appendHashtag,
  applyTextPerProvider,
  type ComposerState,
  EMPTY_COMPOSER_STATE,
} from "../src/features/social-posts/lib/composer-state"
import {
  defaultWritingToggles,
  uniqueProviders,
} from "../src/features/social-posts-ai/lib/writing-defaults"
import {
  parseWritingPreferences,
  writingPreferencesKey,
} from "../src/features/social-posts-ai/lib/writing-preferences"

describe("defaultWritingToggles", () => {
  test("hashtags are on for Instagram and TikTok, off for Facebook and Threads", () => {
    expect(defaultWritingToggles(["instagram"]).hashtags).toBe(true)
    expect(defaultWritingToggles(["tiktok"]).hashtags).toBe(true)
    expect(defaultWritingToggles(["facebook"]).hashtags).toBe(false)
    expect(defaultWritingToggles(["threads"]).hashtags).toBe(false)
    expect(defaultWritingToggles([]).hashtags).toBe(false)
  })

  test("several networks turn hashtags on when any favours them", () => {
    expect(defaultWritingToggles(["threads", "instagram"]).hashtags).toBe(true)
  })

  test("emoji is on and call to action is off", () => {
    expect(defaultWritingToggles(["threads"])).toMatchObject({
      callToAction: false,
      emoji: true,
    })
  })

  test("uniqueProviders dedupes and orders", () => {
    expect(uniqueProviders(["threads", "facebook", "threads"])).toEqual([
      "facebook",
      "threads",
    ])
  })

  test("the writer knows exactly the social providers", () => {
    expect(postWriterProviders.options).toEqual(socialProviders.options)
  })
})

describe("parseWritingPreferences", () => {
  test("reads saved choices", () => {
    expect(
      parseWritingPreferences(
        '{"hashtags":false,"emoji":true,"variants":2,"callToActionText":"Hi"}',
      ),
    ).toEqual({
      callToActionText: "Hi",
      emoji: true,
      hashtags: false,
      variants: 2,
    })
  })

  test("anything unreadable means nothing chosen yet", () => {
    expect(parseWritingPreferences(null)).toEqual({})
    expect(parseWritingPreferences("{not json")).toEqual({})
    expect(parseWritingPreferences('{"variants":7}')).toEqual({})
    expect(parseWritingPreferences('{"hashtags":"yes"}')).toEqual({})
  })

  test("is keyed per workspace", () => {
    expect(writingPreferencesKey("1")).not.toBe(writingPreferencesKey("2"))
  })
})

describe("applyTextPerProvider", () => {
  const target = (destinationId: string) => ({
    contentType: null,
    customised: false,
    destinationId,
    firstComment: "",
    media: null,
    options: {},
    parts: [],
    scheduledAt: null,
    text: "",
  })
  const state: ComposerState = {
    ...EMPTY_COMPOSER_STATE,
    targets: [target("a"), target("b"), target("c")],
    text: "shared",
  }
  const providerOf = (id: string) =>
    ({ a: "instagram", b: "threads", c: "instagram" })[id] as
      | "instagram"
      | "threads"
      | undefined

  test("customises every target of the network and keeps the others", () => {
    const next = applyTextPerProvider(
      state,
      [{ provider: "instagram", text: "IG text" }],
      providerOf,
    )

    expect(next.targets.map((t) => [t.customised, t.text])).toEqual([
      [true, "IG text"],
      [false, ""],
      [true, "IG text"],
    ])
    expect(next.text).toBe("shared")
    expect(state.targets[0]?.customised).toBe(false)
  })
})

describe("appendHashtag", () => {
  test("adds to the same line, or starts the text", () => {
    expect(appendHashtag("Sale today  ", "#sale")).toBe("Sale today #sale")
    expect(appendHashtag("", "#sale")).toBe("#sale")
  })
})
