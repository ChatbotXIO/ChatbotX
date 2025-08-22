"use client"

import { TagIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { TagMultiSelect } from "@/features/tags/components/tag-multi-select"
import { BaseStepEditor } from "../base/editor"

export const addContactTagStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()

  return (
    <BaseStepEditor icon={TagIcon} title={t("flows.stepType.addContactTag")}>
      <TagMultiSelect
        isRequired
        label={t("fields.tag.label")}
        name={`${parentName}.tags`}
      />
    </BaseStepEditor>
  )
}
