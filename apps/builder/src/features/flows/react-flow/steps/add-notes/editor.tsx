"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

type AddNotesStepEditorProps = {
  parentName: string
}

const AddNotesStepEditor = (props: AddNotesStepEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  return (
    <BaseStepEditor icon={TextIcon} title={t("flows.actions.addContactNotes")}>
      <InputField
        label={t("fields.notes.label")}
        name={`${parentName}.content`}
      />
    </BaseStepEditor>
  )
}

export default AddNotesStepEditor
