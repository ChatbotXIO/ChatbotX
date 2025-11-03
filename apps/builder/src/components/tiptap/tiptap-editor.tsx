"use client"

import Emoji, { gitHubEmojis } from "@tiptap/extension-emoji"
import Mention from "@tiptap/extension-mention"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import emojiSuggestion from "./extensions/emoij/suggestion"
import variableInjectionSuggestion from "./extensions/variable-injection/suggestion"
import "./tiptap-editor.css"

type TiptapEditorProps = {
  defaultValue?: string
  onChange?: (content: string) => void
  customFields: { label: string; value: string; type: string }[]
}

export const TiptapEditor = ({
  defaultValue,
  onChange,
  customFields,
}: TiptapEditorProps) => {
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
    ],
    content: defaultValue,
    // Don't render immediately on the server to avoid SSR issues
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const text = editor.getText()
      onChange?.(text)
    },
  })

  return <EditorContent editor={tiptapEditor} />
}
