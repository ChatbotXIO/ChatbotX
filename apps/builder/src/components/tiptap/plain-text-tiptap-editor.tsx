"use client"

import Emoji, { gitHubEmojis } from "@tiptap/extension-emoji"
import Mention from "@tiptap/extension-mention"
import Placeholder from "@tiptap/extension-placeholder"
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import emojiSuggestion from "./extensions/emoij/suggestion"
import {
  plainTextToParagraphHtmlWithVariableMentions,
  renderVariableMentionHTML,
  renderVariableMentionText,
  toVariableMentionAttrs,
} from "./extensions/variable-injection/mention"
import variableInjectionSuggestion from "./extensions/variable-injection/suggestion"
import "./tiptap-editor.css"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react"
import { CodeXml, Smile } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { htmlToPlainTextWithBlocks } from "./html-to-plain-text"
import { usePromptVariableOptions } from "./use-prompt-variable-options"

type PlainTextTiptapEditorProps = {
  initValue?: string
  placeholder?: string
  showEmojiPicker?: boolean
  channels?: ChannelType[]
  includeCouponVariables?: boolean
  includeRawCustomFieldVariables?: boolean
  onChange?: (content: string) => void
  /** Single-line height with the variable picker rendered inside on the right. */
  inline?: boolean
}

export const PlainTextTiptapEditor = ({
  initValue,
  onChange,
  channels,
  includeCouponVariables = false,
  includeRawCustomFieldVariables = false,
  placeholder = "Type a message...",
  showEmojiPicker = true,
  inline = false,
}: PlainTextTiptapEditorProps) => {
  const [isOpenEmoji, setIsOpenEmoji] = useState(false)
  const [isEditorFocused, setIsEditorFocused] = useState(false)
  const [isOpenCustomField, setIsOpenCustomField] = useState(false)
  const promptVariableOptions = usePromptVariableOptions({
    channels,
    includeCouponVariables,
    includeRawCustomFieldVariables,
  })
  const promptVariableOptionsRef = useRef(promptVariableOptions)

  useEffect(() => {
    promptVariableOptionsRef.current = promptVariableOptions
  }, [promptVariableOptions])

  const plainTextToParagraphHtml = useCallback(
    (value: string) =>
      plainTextToParagraphHtmlWithVariableMentions(
        value,
        promptVariableOptionsRef.current,
      ),
    [],
  )

  const tiptapEditor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        renderHTML: renderVariableMentionHTML,
        renderText: renderVariableMentionText,
        suggestion: variableInjectionSuggestion({
          listOfPromptVariables: () => promptVariableOptionsRef.current,
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
        class: inline
          ? "tiptap-plain-text tiptap-plain-text-inline"
          : "tiptap-plain-text",
      },
      handlePaste(view, event) {
        const clipboardHtml = event.clipboardData?.getData("text/html")
        const clipboardText = event.clipboardData?.getData("text/plain")
        const text = clipboardHtml
          ? htmlToPlainTextWithBlocks(clipboardHtml)
          : (clipboardText ?? "")

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
      // Empty content must clear to a single blank line — feeding "<p><br></p>"
      // injects a hard break that renders as a spurious second line.
      tiptapEditor.commands.setContent(
        initValue ? plainTextToParagraphHtml(initValue) : "",
      )
    }
  }, [tiptapEditor, initValue, plainTextToParagraphHtml])

  // Inline (filter value) keeps the picker inside the box on the right and always
  // visible; the default hangs it below the editor and reveals it on focus.
  const iconBarClassName = cn(
    "absolute z-10 flex cursor-pointer items-center",
    inline
      ? "end-1 top-1/2 -translate-y-1/2"
      : cn(
          "end-0 bottom-0 translate-y-full rounded-b-sm bg-gray-500 hover:bg-gray-600",
          isEditorFocused ? "opacity-100" : "opacity-0",
        ),
  )
  const iconWrapperClassName = inline ? "p-1" : "p-2"
  const iconClassName = inline
    ? "text-muted-foreground hover:text-foreground"
    : "text-white"

  return (
    <div className="relative">
      <EditorContent editor={tiptapEditor} />

      <div className={iconBarClassName}>
        {showEmojiPicker && (
          <Popover onOpenChange={setIsOpenEmoji} open={isOpenEmoji}>
            <PopoverTrigger
              nativeButton={false}
              onClick={() => setIsEditorFocused(true)}
              render={
                <div className={iconWrapperClassName}>
                  <Smile className={iconClassName} size={inline ? 16 : 14} />
                </div>
              }
            />
            <PopoverContent className="w-auto p-0">
              <EmojiPicker onEmojiClick={onEmojiClick} />
            </PopoverContent>
          </Popover>
        )}

        <Popover onOpenChange={setIsOpenCustomField} open={isOpenCustomField}>
          <PopoverTrigger
            nativeButton={false}
            onClick={() => setIsEditorFocused(true)}
            render={
              <div className={iconWrapperClassName}>
                <CodeXml className={iconClassName} size={inline ? 16 : 14} />
              </div>
            }
          />
          <PopoverContent className="w-auto p-0">
            {promptVariableOptions.length > 0 && (
              <div className="max-h-60 w-50 overflow-y-auto">
                {promptVariableOptions.map((field, index) => {
                  const showGroup =
                    Boolean(field.group) &&
                    promptVariableOptions[index - 1]?.group !== field.group

                  return (
                    <div key={field.value}>
                      {showGroup ? (
                        <div className="px-2 pt-2 pb-1 font-medium text-muted-foreground text-xs">
                          {field.group}
                        </div>
                      ) : null}
                      <Button
                        className="w-full cursor-pointer justify-start rounded-none p-2"
                        onClick={() => {
                          tiptapEditor
                            ?.chain()
                            .insertContent({
                              type: "mention",
                              attrs: toVariableMentionAttrs(field),
                            })
                            .focus()
                            .run()
                          setIsOpenCustomField(false)
                        }}
                        variant="ghost"
                      >
                        {field.label}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
