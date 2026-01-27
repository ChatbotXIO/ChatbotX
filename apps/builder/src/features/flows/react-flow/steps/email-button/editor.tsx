"use client"

import { ButtonStepEditor } from "../button/editor"

type EmailButtonStepEditorProps = {
  parentName: string
}

export default function EmailButtonStepEditor(
  props: EmailButtonStepEditorProps,
) {
  const { parentName } = props

  return <ButtonStepEditor parentName={`${parentName}.beforeStep`} />
}
