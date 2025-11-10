"use client"

import { TagInputField } from "@aha.chat/ui/components/form/tag-input-field"
import { TagIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"

const AddContactTagStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()

  const { tagOptions } = useStepStore((state) => state)

  return (
    <BaseStepEditor icon={TagIcon} title={t("flows.actions.addContactTag")}>
      <TagInputField
        autocompleteOptions={tagOptions}
        label={t("fields.tag.label")}
        name={`${parentName}.tags`}
        required
      />
    </BaseStepEditor>
  )
}

export default AddContactTagStepEditor
