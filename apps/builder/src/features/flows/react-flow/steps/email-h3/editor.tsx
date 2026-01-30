"use client"

import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type EmailH3StepEditorProps = {
  parentName: string
}

export default function EmailH3StepEditor(props: EmailH3StepEditorProps) {
  const { parentName } = props

  return <TiptapEditorField name={`${parentName}.text`} placeholder="Header" />
}
