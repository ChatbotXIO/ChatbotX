// @vitest-environment jsdom

import "./helpers/emoji-canvas-shim"
import Emoji, { gitHubEmojis } from "@tiptap/extension-emoji"
import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import emojiSuggestion from "@/components/tiptap/extensions/emoij/suggestion"
import { fullyQualifiedGitHubEmojis } from "@/components/tiptap/fully-qualified-github-emojis"

const loadedMessage = "1️⃣ ❤️ ⚠️"

const codePoints = (value: string): string =>
  [...value]
    .map((char) => (char.codePointAt(0) ?? 0).toString(16).padStart(4, "0"))
    .join(" ")

const withoutVariationSelector = (value: string): string =>
  value.replaceAll("\uFE0F", "")

const variationSelectorCount = (value: string): number =>
  [...value].filter((char) => char === "\uFE0F").length

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

// Same Emoji.configure options as plain-text-tiptap-editor.tsx and
// tiptap-editor.tsx. Saving a flow message calls getText({ blockSeparator }).
const createEditor = (): Editor =>
  new Editor({
    extensions: [
      StarterKit,
      Emoji.configure({
        emojis: fullyQualifiedGitHubEmojis,
        enableEmoticons: true,
        suggestion: emojiSuggestion,
      }),
    ],
  })

const readBack = (value: string) => {
  editor?.destroy()
  editor = createEditor()
  editor.commands.setContent(`<p>${value}</p>`)
  return {
    rendered: editor.view.dom.textContent ?? "",
    saved: editor.getText({ blockSeparator: "\n" }),
  }
}

describe("flow editor emoji variation selector", () => {
  it("keeps U+FE0F when a message is loaded and read back with getText", () => {
    const { rendered, saved } = readBack(loadedMessage)

    expect(codePoints(saved)).toBe(codePoints(loadedMessage))
    expect(saved).toBe(loadedMessage)
    expect(codePoints(rendered)).toBe(codePoints(loadedMessage))
    expect(rendered).toBe(loadedMessage)
  })

  it("keeps U+FE0F for an arrow and a ZWJ sequence", () => {
    for (const value of ["➡️", "❤️‍🔥"]) {
      const { rendered, saved } = readBack(value)
      expect(codePoints(saved)).toBe(codePoints(value))
      expect(saved).toBe(value)
      expect(codePoints(rendered)).toBe(codePoints(value))
    }
  })

  it("serializes emoji inserted by the suggestion with the fully-qualified character", () => {
    editor = createEditor()
    expect(editor.commands.setEmoji("one")).toBe(true)
    expect(editor.commands.setEmoji("heart")).toBe(true)
    expect(editor.commands.setEmoji("warning")).toBe(true)
    expect(editor.commands.setEmoji("arrow_right")).toBe(true)

    const saved = editor.getText({ blockSeparator: "\n" })
    const rendered = editor.view.dom.textContent ?? ""
    const expected = "1️⃣❤️⚠️➡️"

    expect(codePoints(saved)).toBe(codePoints(expected))
    expect(saved).toBe(expected)
    expect(codePoints(rendered)).toBe(codePoints(expected))
    expect(rendered).toBe(expected)
  })

  it("inserts a picker emoji without dropping U+FE0F", () => {
    editor = createEditor()
    editor.commands.insertContent(loadedMessage)

    const saved = editor.getText({ blockSeparator: "\n" })
    expect(codePoints(saved)).toBe(codePoints(loadedMessage))
    expect(saved).toBe(loadedMessage)
  })

  it("does not add U+FE0F to emoji that are fully qualified without it", () => {
    const value = "😀 👍"
    const { rendered, saved } = readBack(value)

    expect(saved).toBe(value)
    expect(rendered).toBe(value)
    expect(saved.includes("\uFE0F")).toBe(false)
    expect(rendered.includes("\uFE0F")).toBe(false)
  })

  it("still matches the suggestion list by shortcode", () => {
    editor = createEditor()
    const query = "heart"
    const matches = editor.storage.emoji.emojis.filter(
      ({ shortcodes, tags }) =>
        shortcodes.find((shortcode) =>
          shortcode.startsWith(query.toLowerCase()),
        ) || tags.find((tag) => tag.startsWith(query.toLowerCase())),
    )

    expect(matches.some((item) => item.name === "heart")).toBe(true)
    expect(matches.length).toBeGreaterThan(0)
  })

  it("only inserts U+FE0F from the fallback image and leaves other emoji unchanged", () => {
    const originalByName = new Map(
      gitHubEmojis.map((item) => [item.name, item]),
    )

    for (const item of fullyQualifiedGitHubEmojis) {
      const original = originalByName.get(item.name)
      expect(original).toBeDefined()
      if (!(original?.emoji && item.emoji)) {
        expect(item.emoji).toBe(original?.emoji)
        continue
      }

      expect(withoutVariationSelector(item.emoji)).toBe(
        withoutVariationSelector(original.emoji),
      )
      expect(variationSelectorCount(item.emoji)).toBeGreaterThanOrEqual(
        variationSelectorCount(original.emoji),
      )
    }

    expect(
      fullyQualifiedGitHubEmojis.find((item) => item.name === "one")?.emoji,
    ).toBe("1️⃣")
    expect(
      fullyQualifiedGitHubEmojis.find((item) => item.name === "grinning")
        ?.emoji,
    ).toBe("😀")
    expect(
      fullyQualifiedGitHubEmojis.find((item) => item.name === "trollface")
        ?.emoji,
    ).toBeUndefined()
  })
})
