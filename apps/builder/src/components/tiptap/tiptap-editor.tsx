"use client"

import Emoji, { gitHubEmojis } from "@tiptap/extension-emoji"
import Mention from "@tiptap/extension-mention"
import Placeholder from "@tiptap/extension-placeholder"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import emojiSuggestion from "./extensions/emoij/suggestion"
import variableInjectionSuggestion from "./extensions/variable-injection/suggestion"
import "./tiptap-editor.css"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react"
import { CodeXml, Smile } from "lucide-react"
import { useState } from "react"

type TiptapEditorProps = {
  defaultValue?: string
  placeholder?: string
  onChange?: (content: string) => void
  customFields: { label: string; value: string; type: string }[]
}

export const TiptapEditor = ({
  defaultValue,
  onChange,
  customFields,
  placeholder = "Type a message...",
}: TiptapEditorProps) => {
  const [isOpenEmoji, setIsOpenEmoji] = useState(false)
  const [isEditorFocused, setIsEditorFocused] = useState(false)
  const [isOpenCustomField, setIsOpenCustomField] = useState(false)

  const tiptapEditor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        suggestion: variableInjectionSuggestion({
          listOfPromptVariables: customFields,
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
      preserveWhitespace: true,
    },
    content: defaultValue,
    // Don't render immediately on the server to avoid SSR issues
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const text = editor.getText()
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

  return (
    <div className="relative">
      <EditorContent editor={tiptapEditor} />

      <div
        className={`${isEditorFocused ? "opacity-100" : "opacity-0"} absolute right-0 bottom-0 z-10 flex translate-y-full cursor-pointer items-center rounded-b-sm bg-gray-500 hover:bg-gray-600`}
      >
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

        <Popover onOpenChange={setIsOpenCustomField} open={isOpenCustomField}>
          <PopoverTrigger asChild onClick={() => setIsEditorFocused(true)}>
            <div className="p-2">
              <CodeXml className="text-white" size={14} />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            {customFields.length > 0 && (
              <div className="max-h-60 w-50 overflow-y-auto">
                {customFields.map((field) => (
                  <Button
                    className="w-full cursor-pointer justify-start rounded-none p-2"
                    key={field.value}
                    onClick={() => {
                      setEditorValue(`{{${field.label}}}`)
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
