"use client"

import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type EmailCodeStepEditorProps = {
  parentName: string
}

export default function EmailCodeStepEditor(props: EmailCodeStepEditorProps) {
  const { parentName } = props

  return <TiptapEditorField name={`${parentName}.text`} placeholder="Code" />
}
