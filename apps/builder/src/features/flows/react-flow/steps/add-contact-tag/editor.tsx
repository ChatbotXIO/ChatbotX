"use client"

import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { TagIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTagOptions } from "@/features/tags/provider/tag-hook"
import { BaseStepEditor } from "../base/editor"

type AddContactTagStepEditorProps = {
  parentName: string
}

const AddContactTagStepEditor = ({
  parentName,
}: AddContactTagStepEditorProps) => {
  const t = useTranslations()
  const tagOptions = useTagOptions()

  return (
    <BaseStepEditor icon={TagIcon} title={t("flows.actions.addContactTag")}>
      <TagsInputField
        addAnotherPlaceholder={t("actions.addAnother")}
        label={t("fields.tag.label")}
        name={`${parentName}.tags`}
        placeholder={t("actions.enterFieldAndPressEnter", {
          field: t("fields.tag.label").toLowerCase(),
        })}
        suggestions={tagOptions}
      />
    </BaseStepEditor>
  )
}

export default AddContactTagStepEditor
