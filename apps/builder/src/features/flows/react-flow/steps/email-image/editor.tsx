"use client"

import { MediaLibraryOrInsertLink } from "@/components/media-library-or-insert-link"

type EmailTextStepEditorProps = {
  parentName: string
}

export default function EmailTextStepEditor(props: EmailTextStepEditorProps) {
  const { parentName } = props

  return <MediaLibraryOrInsertLink fileType="image" parentName={parentName} />
}
