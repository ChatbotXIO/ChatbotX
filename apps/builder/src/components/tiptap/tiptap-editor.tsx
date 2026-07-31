"use client"

import Emoji, { gitHubEmojis } from "@tiptap/extension-emoji"
import Mention from "@tiptap/extension-mention"
import Placeholder from "@tiptap/extension-placeholder"
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
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react"
import { htmlToText } from "html-to-text"
import { CodeXml, Smile } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { usePromptVariableOptions } from "./use-prompt-variable-options"

type TiptapEditorProps = {
  initValue?: string
  placeholder?: string
  showEmojiPicker?: boolean
  channels?: ChannelType[]
  includeCouponVariables?: boolean
  onChange?: (content: string) => void
}

export const TiptapEditor = ({
  initValue,
  onChange,
  channels,
  includeCouponVariables = false,
  placeholder = "Type a message...",
  showEmojiPicker = true,
}: TiptapEditorProps) => {
  const [isOpenEmoji, setIsOpenEmoji] = useState(false)
  const [isEditorFocused, setIsEditorFocused] = useState(false)
  const [isOpenCustomField, setIsOpenCustomField] = useState(false)
  const promptVariableOptions = usePromptVariableOptions({
    channels,
    includeCouponVariables,
  })
  const promptVariableOptionsRef = useRef(promptVariableOptions)

  useEffect(() => {
    promptVariableOptionsRef.current = promptVariableOptions
  }, [promptVariableOptions])

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
      transformPastedText(text) {
        return text.replace(/\xA0/g, " ")
      },
      transformPastedHTML(html) {
        return htmlToText(html)
      },
    },
    // Don't render immediately on the server to avoid SSR issues
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
    if (tiptapEditor && initValue) {
      const html = plainTextToParagraphHtmlWithVariableMentions(
        initValue,
        promptVariableOptionsRef.current,
      )
      tiptapEditor.commands.setContent(html)
    }
  }, [tiptapEditor, initValue])

  return (
    <div className="relative">
      <EditorContent
        // className="min-h-[calc(3*1.5em+0.5rem)]"
        editor={tiptapEditor}
      />

      <div
        className={`${isEditorFocused ? "opacity-100" : "opacity-0"} absolute end-0 bottom-0 z-10 flex translate-y-full cursor-pointer items-center rounded-b-sm bg-gray-500 hover:bg-gray-600`}
      >
        {showEmojiPicker && (
          <Popover onOpenChange={setIsOpenEmoji} open={isOpenEmoji}>
            <PopoverTrigger
              onClick={() => setIsEditorFocused(true)}
              render={
                <div className="p-2">
                  <Smile className="text-white" size={14} />
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
            onClick={() => setIsEditorFocused(true)}
            render={
              <div className="p-2">
                <CodeXml className="text-white" size={14} />
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
