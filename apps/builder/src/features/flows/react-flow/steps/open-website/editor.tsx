"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { LinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

type OpenWebsiteStepEditorProps = {
  parentName: string
}

const OpenWebsiteStepEditor = (props: OpenWebsiteStepEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor icon={LinkIcon} title={t("flows.stepType.openWebsite")}>
      <InputField label="Link" name={`${props.parentName}.url`} />
    </BaseStepEditor>
  )
}

export { OpenWebsiteStepEditor }
