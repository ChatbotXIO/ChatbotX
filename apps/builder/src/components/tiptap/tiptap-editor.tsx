"use client"

import Mention from "@tiptap/extension-mention"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import emojiSuggestion from "./emoji/suggestion"
import variableInjectionSuggestion from "./variable-injection/suggestion"

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
        suggestions: [
          variableInjectionSuggestion(customFields),
          emojiSuggestion,
        ],
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
