"use client"

import { DirectUploadOrInsertLink } from "@/components/direct-upload"

type EmailTextStepEditorProps = {
  parentName: string
}

export default function EmailTextStepEditor(props: EmailTextStepEditorProps) {
  const { parentName } = props

  return <DirectUploadOrInsertLink fileType="image" parentName={parentName} />
}
