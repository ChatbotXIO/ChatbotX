"use client"

import Emoji, { gitHubEmojis } from "@tiptap/extension-emoji"
import Mention from "@tiptap/extension-mention"
import Placeholder from "@tiptap/extension-placeholder"
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import emojiSuggestion from "./extensions/emoij/suggestion"
import variableInjectionSuggestion from "./extensions/variable-injection/suggestion"
import "./tiptap-editor.css"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react"
import { htmlToText } from "html-to-text"
import { CodeXml, Smile } from "lucide-react"
import { useEffect, useState } from "react"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"

type PlainTextTiptapEditorProps = {
  initValue?: string
  placeholder?: string
  showEmojiPicker?: boolean
  onChange?: (content: string) => void
}

const LINE_BREAK_REGEX = /\r\n?|\n/
const COLLAPSED_LINE_BREAK_REGEX = /\n{3,}/g

const BLOCK_TAG_NAMES = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BR",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
])

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const plainTextToParagraphHtml = (value: string) =>
  value
    .replace(/\xA0/g, " ")
    .split(LINE_BREAK_REGEX)
    .map((line) => `<p>${line ? escapeHtml(line) : "<br>"}</p>`)
    .join("")

const htmlToPlainTextWithBlocks = (html: string) => {
  if (typeof DOMParser === "undefined") {
    return htmlToText(html, { wordwrap: false })
  }

  const document = new DOMParser().parseFromString(html, "text/html")
  const parts: string[] = []

  const appendLineBreak = () => {
    if (parts.at(-1) !== "\n") {
      parts.push("\n")
    }
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "")
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    const element = node as Element
    const tagName = element.tagName

    if (tagName === "BR") {
      appendLineBreak()
      return
    }

    const isBlock = BLOCK_TAG_NAMES.has(tagName)

    if (isBlock && parts.length > 0) {
      appendLineBreak()
    }

    if (tagName === "LI") {
      parts.push("- ")
    }

    for (const child of Array.from(element.childNodes)) {
      walk(child)
    }

    if (isBlock) {
      appendLineBreak()
    }
  }

  for (const child of Array.from(document.body.childNodes)) {
    walk(child)
  }

  return parts
    .join("")
    .replace(/\xA0/g, " ")
    .replace(COLLAPSED_LINE_BREAK_REGEX, "\n\n")
    .split(LINE_BREAK_REGEX)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}

export const PlainTextTiptapEditor = ({
  initValue,
  onChange,
  placeholder = "Type a message...",
  showEmojiPicker = true,
}: PlainTextTiptapEditorProps) => {
  const [isOpenEmoji, setIsOpenEmoji] = useState(false)
  const [isEditorFocused, setIsEditorFocused] = useState(false)
  const [isOpenCustomField, setIsOpenCustomField] = useState(false)
  const customFieldSelectOptions = useCustomFieldSelectOptions({
    includeReserved: true,
    customFieldValueKey: "name",
  })

  const tiptapEditor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        suggestion: variableInjectionSuggestion({
          listOfPromptVariables: customFieldSelectOptions,
        }),
      }),
      Emoji.configure({
        emojis: gitHubEmojis,
        enableEmoticons: true,
        suggestion: emojiSuggestion,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    parseOptions: {
      preserveWhitespace: "full",
    },
    editorProps: {
      attributes: {
        class: "tiptap-plain-text",
      },
      handlePaste(view, event) {
        const clipboardText = event.clipboardData?.getData("text/plain")
        const clipboardHtml = event.clipboardData?.getData("text/html")
        const text =
          clipboardText ??
          (clipboardHtml ? htmlToPlainTextWithBlocks(clipboardHtml) : "")

        if (!text) {
          return false
        }

        const element = document.createElement("div")
        element.innerHTML = plainTextToParagraphHtml(text)

        const slice = ProseMirrorDOMParser.fromSchema(
          view.state.schema,
        ).parseSlice(element)
        const transaction = view.state.tr
          .replaceSelection(slice)
          .scrollIntoView()

        view.dispatch(transaction)

        return true
      },
      transformPastedText(text) {
        return text.replace(/\xA0/g, " ")
      },
      transformPastedHTML(html) {
        return plainTextToParagraphHtml(htmlToPlainTextWithBlocks(html))
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const text = editor.getText({ blockSeparator: "\n" })
      onChange?.(text)
    },
    onFocus: () => {
      setIsEditorFocused(true)
    },
    onBlur: () => {
      setIsEditorFocused(false)
    },
  })

  const onEmojiClick = (emojiObject: EmojiClickData) => {
    setEditorValue(emojiObject.emoji)
  }

  const setEditorValue = (value: string) => {
    if (tiptapEditor) {
      tiptapEditor.commands.insertContent(value)
      tiptapEditor.commands.focus()
    }
  }

  useEffect(() => {
    if (tiptapEditor && initValue !== undefined) {
      tiptapEditor.commands.setContent(plainTextToParagraphHtml(initValue))
    }
  }, [tiptapEditor, initValue])

  return (
    <div className="relative">
      <EditorContent editor={tiptapEditor} />

      <div
        className={`${isEditorFocused ? "opacity-100" : "opacity-0"} absolute right-0 bottom-0 z-10 flex translate-y-full cursor-pointer items-center rounded-b-sm bg-gray-500 hover:bg-gray-600`}
      >
        {showEmojiPicker && (
          <Popover onOpenChange={setIsOpenEmoji} open={isOpenEmoji}>
            <PopoverTrigger asChild onClick={() => setIsEditorFocused(true)}>
              <div className="p-2">
                <Smile className="text-white" size={14} />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <EmojiPicker onEmojiClick={onEmojiClick} />
            </PopoverContent>
          </Popover>
        )}

        <Popover onOpenChange={setIsOpenCustomField} open={isOpenCustomField}>
          <PopoverTrigger asChild onClick={() => setIsEditorFocused(true)}>
            <div className="p-2">
              <CodeXml className="text-white" size={14} />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            {customFieldSelectOptions.length > 0 && (
              <div className="max-h-60 w-50 overflow-y-auto">
                {customFieldSelectOptions.map((field) => (
                  <Button
                    className="w-full cursor-pointer justify-start rounded-none p-2"
                    key={field.value}
                    onClick={() => {
                      tiptapEditor
                        ?.chain()
                        .insertContent({
                          type: "mention",
                          attrs: { id: `${field.value}}}` },
                        })
                        .focus()
                        .run()
                      setIsOpenCustomField(false)
                    }}
                    variant="ghost"
                  >
                    {field.label}
                  </Button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
