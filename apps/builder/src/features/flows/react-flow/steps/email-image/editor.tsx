"use client"

import { FileType } from "@aha.chat/database/types"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"

type EmailTextStepEditorProps = {
  parentName: string
}

export default function EmailTextStepEditor(props: EmailTextStepEditorProps) {
  const { parentName } = props

  return (
    <DirectUploadOrInsertLink
      fileType={FileType.image}
      parentName={parentName}
    />
  )
}
