"use client"

import { OctagonXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { TagMultiSelect } from "@/features/tags/components/tag-multi-select"
import { BaseStepEditor } from "../base/editor"

type RemoveContactTagStepEditorProps = {
  parentName: string
}

export const RemoveContactTagStepEditor = (
  props: RemoveContactTagStepEditorProps,
) => {
  const t = useTranslations()
  const { parentName } = props

  return (
    <BaseStepEditor
      icon={OctagonXIcon}
      title={t("flows.stepType.removeContactTag")}
    >
      <TagMultiSelect
        isRequired
        label={t("fields.tag.label")}
        name={`${parentName}.tags`}
      />
    </BaseStepEditor>
  )
}
