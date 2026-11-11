// @vitest-environment jsdom

import "./helpers/emoji-canvas-shim"
import { gitHubEmojis, shortcodeToEmoji } from "@tiptap/extension-emoji"
import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import emojiSuggestion from "@/components/tiptap/extensions/emoij/suggestion"
import { configureFlowEditorEmoji } from "@/components/tiptap/fully-qualified-github-emojis"

// jsdom text nodes have no client rects, and the emoji suggestion measures the
// caret when `:` is typed. A zero rect lets that popup open during shortcode
// input without changing what the input rule inserts.
const emptyRect = new DOMRect(0, 0, 0, 0)
const clientRects = () => [emptyRect] as unknown as DOMRectList
const rectHosts = [Element.prototype, Text.prototype, Range.prototype] as {
  getClientRects?: () => DOMRectList
  getBoundingClientRect?: () => DOMRect
}[]
for (const prototype of rectHosts) {
  if (typeof prototype.getClientRects !== "function") {
    Object.defineProperty(prototype, "getClientRects", { value: clientRects })
  }
  if (typeof prototype.getBoundingClientRect !== "function") {
    Object.defineProperty(prototype, "getBoundingClientRect", {
      value: () => emptyRect,
    })
  }
}

const loadedMessage = "1️⃣ ❤️ ⚠️"

const samples = [
  { name: "one", qualified: "1️⃣", unqualified: "1⃣" },
  { name: "heart", qualified: "❤️", unqualified: "❤" },
  { name: "warning", qualified: "⚠️", unqualified: "⚠" },
  { name: "arrow_right", qualified: "➡️", unqualified: "➡" },
] as const

const codePoints = (value: string): string =>
  [...value]
    .map((char) => (char.codePointAt(0) ?? 0).toString(16).padStart(4, "0"))
    .join(" ")

const withoutVariationSelector = (value: string): string =>
  value.replaceAll("\uFE0F", "")

const variationSelectorCount = (value: string): number =>
  [...value].filter((char) => char === "\uFE0F").length

let editor: Editor | undefined

const flushEditor = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

afterEach(async () => {
  await flushEditor()
  editor?.destroy()
  editor = undefined
})

// Same extension as plain-text-tiptap-editor.tsx and tiptap-editor.tsx.
// Saving a flow message calls getText({ blockSeparator }).
const createEditor = (): Editor =>
  new Editor({
    extensions: [StarterKit, configureFlowEditorEmoji(emojiSuggestion)],
  })

const emojiNodeNames = (target: Editor): string[] => {
  const names: string[] = []
  target.state.doc.descendants((node) => {
    if (node.type.name === "emoji") {
      names.push(String(node.attrs.name))
    }
  })
  return names
}

const plainText = (target: Editor): string => {
  let text = ""
  target.state.doc.descendants((node) => {
    if (node.isText) {
      text += node.text ?? ""
    }
  })
  return text
}

const expectQualifiedEmoji = (
  target: Editor,
  qualified: string,
  names: readonly string[],
  leftover = "",
) => {
  expect(emojiNodeNames(target)).toEqual(names)
  expect(plainText(target)).toBe(leftover)
  const saved = target.getText({ blockSeparator: "\n" })
  const rendered = target.view.dom.textContent ?? ""
  expect(saved, `saved ${codePoints(saved)}`).toBe(qualified)
  expect(rendered, `rendered ${codePoints(rendered)}`).toBe(qualified)
}

// An emoji keyboard inserts the whole grapheme in one input event. Splitting
// U+FE0F into its own keystroke would convert the base character first.
const typeChunk = (target: Editor, text: string) => {
  const { from, to } = target.state.selection
  const handled = target.view.someProp("handleTextInput", (handler) =>
    handler(target.view, from, to, text, () => target.state.tr),
  )
  if (!handled) {
    target.view.dispatch(target.state.tr.insertText(text, from, to))
  }
}

// The suggestion view updates asynchronously. A real keystroke settles before
// the next one; typing the whole shortcode in one turn exits the popup before
// it has started.
const typeText = async (target: Editor, text: string) => {
  for (const char of text) {
    typeChunk(target, char)
    await flushEditor()
  }
}

const loadText = (target: Editor, value: string) => {
  target.commands.setContent(`<p>${value}</p>`)
}

const pastePlainText = (target: Editor, value: string) => {
  // jsdom does not implement ClipboardEvent. pasteText only forwards the
  // event to handlePaste, which this editor does not set.
  target.view.pasteText(value, new Event("paste") as ClipboardEvent)
}

const freshEditor = (): Editor => {
  editor?.destroy()
  editor = createEditor()
  return editor
}

const serializedEmoji = (target: Editor, name: string): string => {
  const emojiType = target.schema.nodes.emoji
  const toText = emojiType?.spec.toText
  if (!(emojiType && typeof toText === "function")) {
    throw new Error("emoji node has no text serializer")
  }
  const node = emojiType.create({ name })
  return toText({
    node,
    pos: 0,
    parent: target.state.doc,
    index: 0,
    range: { from: 0, to: 0 },
  })
}

describe("flow editor emoji variation selector", () => {
  it.each(
    samples,
  )("loads $name from the qualified and unqualified characters as an emoji node", (sample) => {
    for (const value of [sample.qualified, sample.unqualified]) {
      const current = freshEditor()
      loadText(current, value)
      expectQualifiedEmoji(current, sample.qualified, [sample.name])
    }
  })

  it.each(
    samples,
  )("types $name from the qualified and unqualified characters as an emoji node", (sample) => {
    for (const value of [sample.qualified, sample.unqualified]) {
      const current = freshEditor()
      typeChunk(current, value)
      expectQualifiedEmoji(current, sample.qualified, [sample.name])
    }
  })

  it.each(
    samples,
  )("pastes $name from the qualified and unqualified characters as an emoji node", (sample) => {
    for (const value of [sample.qualified, sample.unqualified]) {
      const current = freshEditor()
      pastePlainText(current, value)
      expectQualifiedEmoji(current, sample.qualified, [sample.name])
    }
  })

  it("keeps U+FE0F when a message is loaded and read back with getText", () => {
    const current = freshEditor()
    loadText(current, loadedMessage)

    expectQualifiedEmoji(
      current,
      loadedMessage,
      ["one", "heart", "warning"],
      "  ",
    )
  })

  it("qualifies an unqualified mix and a ZWJ sequence when they are loaded", () => {
    const current = freshEditor()
    loadText(current, "1⃣ ❤ ⚠ ➡")
    expectQualifiedEmoji(
      current,
      "1️⃣ ❤️ ⚠️ ➡️",
      ["one", "heart", "warning", "arrow_right"],
      "   ",
    )

    current.commands.setContent("")
    loadText(current, "❤️‍🔥")
    expectQualifiedEmoji(current, "❤️‍🔥", ["heart_on_fire"])

    current.commands.setContent("")
    loadText(current, "❤‍🔥")
    expectQualifiedEmoji(current, "❤️‍🔥", ["heart_on_fire"])
  })

  it("serializes emoji inserted by the suggestion with the fully-qualified character", () => {
    const current = freshEditor()
    expect(current.commands.setEmoji("one")).toBe(true)
    expect(current.commands.setEmoji("heart")).toBe(true)
    expect(current.commands.setEmoji("warning")).toBe(true)
    expect(current.commands.setEmoji("arrow_right")).toBe(true)

    expectQualifiedEmoji(current, "1️⃣❤️⚠️➡️", [
      "one",
      "heart",
      "warning",
      "arrow_right",
    ])
  })

  it("inserts a picker emoji without dropping U+FE0F", () => {
    const current = freshEditor()
    current.commands.insertContent(loadedMessage)

    expectQualifiedEmoji(
      current,
      loadedMessage,
      ["one", "heart", "warning"],
      "  ",
    )
  })

  it("does not add U+FE0F to emoji that are fully qualified without it", () => {
    const value = "😀 👍"
    const current = freshEditor()
    loadText(current, value)

    expectQualifiedEmoji(current, value, ["grinning", "+1"], " ")
    expect(current.getText({ blockSeparator: "\n" }).includes("\uFE0F")).toBe(
      false,
    )
  })

  it("filters suggestions by calling the suggestion items function", async () => {
    const current = freshEditor()
    const items = emojiSuggestion.items
    if (typeof items !== "function") {
      throw new Error("emoji suggestion items is not a function")
    }

    const heart = await items({ editor: current, query: "red_heart" })
    expect(heart.map((item) => item.name)).toEqual(["heart"])

    const prefix = await items({ editor: current, query: "heart" })
    expect(prefix).toHaveLength(5)
    expect(
      prefix.every(
        (item) =>
          item.shortcodes.some((shortcode: string) =>
            shortcode.startsWith("heart"),
          ) || item.tags.some((tag: string) => tag.startsWith("heart")),
      ),
    ).toBe(true)
  })

  it("converts typed shortcodes into emoji nodes and keeps U+FE0F", async () => {
    const current = freshEditor()
    await typeText(current, ":one::red_heart::warning::arrow_right:")

    expectQualifiedEmoji(current, "1️⃣❤️⚠️➡️", [
      "one",
      "red_heart",
      "warning",
      "arrow_right",
    ])
  })

  it("converts typed emoticons into emoji nodes and keeps U+FE0F", async () => {
    const current = freshEditor()
    await typeText(current, "<3 ")
    expectQualifiedEmoji(current, "❤️ ", ["heart"], " ")

    current.commands.setContent("")
    await typeText(current, ":( ")
    expectQualifiedEmoji(current, "☹️ ", ["frowning_face"], " ")
  })

  it("keeps catalogue characters unqualified and only adds U+FE0F when serializing", () => {
    const current = freshEditor()
    const originalByName = new Map(
      gitHubEmojis.map((item) => [item.name, item.emoji]),
    )

    for (const item of current.storage.emoji.emojis) {
      expect(item.emoji).toBe(originalByName.get(item.name))
    }

    expect(
      current.storage.emoji.emojis.find((item) => item.name === "trollface")
        ?.emoji,
    ).toBeUndefined()
    expect(
      current.storage.emoji.emojis.find((item) => item.name === "heart")?.emoji,
    ).toBe("❤")
    expect(
      current.storage.emoji.emojis.find((item) => item.name === "one")?.emoji,
    ).toBe("1⃣")

    for (const item of gitHubEmojis) {
      const resolved = shortcodeToEmoji(item.name, gitHubEmojis)
      if (!resolved?.emoji) {
        continue
      }
      const saved = serializedEmoji(current, item.name)
      expect(withoutVariationSelector(saved)).toBe(
        withoutVariationSelector(resolved.emoji),
      )
      expect(variationSelectorCount(saved)).toBeGreaterThanOrEqual(
        variationSelectorCount(resolved.emoji),
      )
    }

    expect(serializedEmoji(current, "one")).toBe("1️⃣")
    expect(serializedEmoji(current, "heart")).toBe("❤️")
    expect(serializedEmoji(current, "red_heart")).toBe("❤️")
    expect(serializedEmoji(current, "warning")).toBe("⚠️")
    expect(serializedEmoji(current, "arrow_right")).toBe("➡️")
    expect(serializedEmoji(current, "frowning_face")).toBe("☹️")
    expect(serializedEmoji(current, "white_frowning_face")).toBe("☹️")
    expect(serializedEmoji(current, "heart_on_fire")).toBe("❤️‍🔥")
    expect(serializedEmoji(current, "grinning")).toBe("😀")
    expect(serializedEmoji(current, "+1")).toBe("👍")
    expect(serializedEmoji(current, "sunglasses")).toBe("😎")
    expect(serializedEmoji(current, "dark_sunglasses")).toBe("🕶️")
  })
})
