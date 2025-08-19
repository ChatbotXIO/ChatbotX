"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { T } from "@tolgee/react"
import { TextIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

type AddNotesStepEditorProps = {
  parentName: string
}

export const AddNotesStepEditor = (props: AddNotesStepEditorProps) => {
  const { parentName } = props

  return (
    <BaseStepEditor
      icon={TextIcon}
      title={<T keyName="flows.StepType.AddContactNotes" />}
    >
      <InputField label="Add Notes" name={`${parentName}.content`} />
    </BaseStepEditor>
  )
}
