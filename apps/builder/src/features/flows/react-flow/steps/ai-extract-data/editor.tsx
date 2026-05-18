"use client"

import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"
import { AIExtractDataDialog } from "./components/dialog"

type AIExtractDataEditorProps = {
  parentName: string
}

export const AIExtractDataEditor = (props: AIExtractDataEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  const { getValues } = useFormContext()
  const provider = getValues(`${parentName}.provider`)

  return (
    <BaseStepEditor
      icon={BotIcon}
      title={t("fields.flows.aiExtractData", {
        aiName: t(`aiProviders.${provider}`),
      })}
    >
      <AIExtractDataDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
