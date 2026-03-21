"use client"

import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { OctagonXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTagOptions } from "@/features/tags/provider/tag-hook"
import { BaseStepEditor } from "../base/editor"

type RemoveContactTagStepEditorProps = {
  parentName: string
}

const RemoveContactTagStepEditor = (props: RemoveContactTagStepEditorProps) => {
  const t = useTranslations()
  const { parentName } = props
  const tagOptions = useTagOptions()

  return (
    <BaseStepEditor
      icon={OctagonXIcon}
      title={t("flows.actions.removeContactTag")}
    >
      <TagsInputField
        label={t("fields.tag.label")}
        name={`${parentName}.tags`}
        suggestions={tagOptions}
      />
    </BaseStepEditor>
  )
}

export default RemoveContactTagStepEditor
