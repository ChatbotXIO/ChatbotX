"use client"

import { InputField } from "@/components/form/input-field"
import { T } from "@tolgee/react"
import { TextIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

export const AddNotesStepEditor = ({ parentName }: { parentName: string }) => {
  return (
    <BaseStepEditor
      icon={TextIcon}
      title={<T keyName="flows.StepType.AddNotes" />}
    >
      <InputField name={`${parentName}.content`} label="Add Notes" />
    </BaseStepEditor>
  )
}
