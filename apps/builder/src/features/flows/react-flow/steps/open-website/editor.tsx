"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { LinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

type OpenWebsiteStepEditorProps = {
  parentName: string
}

const OpenWebsiteStepEditor = ({ parentName }: OpenWebsiteStepEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor icon={LinkIcon} title={t("flows.actions.openWebsite")}>
      <InputField label="Link" name={`${parentName}.url`} />
    </BaseStepEditor>
  )
}

export default OpenWebsiteStepEditor
