// @vitest-environment jsdom
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON references are literal `${...}` text

import { Editor } from "@tiptap/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  plainTextStarterKit,
  toSingleLine,
} from "@/components/tiptap/plain-text-tiptap-editor"

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

// Types one character at a time through ProseMirror's text-input hook, the
// path Tiptap input rules (`**bold**` → bold mark, `# ` → heading) listen on.
const typeText = (target: Editor, text: string) => {
  for (const char of text) {
    const { from, to } = target.state.selection
    const handled = target.view.someProp("handleTextInput", (handler) =>
      handler(target.view, from, to, char, () => target.state.tr),
    )
    if (!handled) {
      target.view.dispatch(target.state.tr.insertText(char, from, to))
    }
  }
}

describe("plainTextStarterKit", () => {
  it.each([
    "**bold**",
    "*italic*",
    "~~strike~~",
    "# Title",
    "- item",
    "1. item",
    "> quote",
    "---",
    "`code`",
    "`'Hi ' ${form.name}`",
  ])("keeps %s exactly as typed", (input) => {
    editor = new Editor({ extensions: [plainTextStarterKit] })
    typeText(editor, input)

    expect(editor.getText({ blockSeparator: "\n" })).toBe(input)
  })
})

describe("toSingleLine", () => {
  it("joins pasted lines with one space", () => {
    expect(toSingleLine("Option A\nextra")).toBe("Option A extra")
    expect(toSingleLine("A \r\n  B\n\nC")).toBe("A B C")
    expect(toSingleLine("one line")).toBe("one line")
  })
})
