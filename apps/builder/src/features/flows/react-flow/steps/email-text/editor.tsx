"use client"

import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type EmailTextStepEditorProps = {
  parentName: string
}

export default function EmailTextStepEditor(props: EmailTextStepEditorProps) {
  const { parentName } = props

  return <TiptapEditorField name={`${parentName}.text`} placeholder="Text" />
}
