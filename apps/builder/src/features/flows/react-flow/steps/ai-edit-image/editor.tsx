"use client"

import { ImageIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"
import { AIEditImageDialog } from "./components/ai-model-dialog"

type AIEditImageEditorProps = {
  parentName: string
}

export const AIEditImageEditor = (props: AIEditImageEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  const { getValues } = useFormContext()
  const provider = getValues(`${parentName}.provider`)

  return (
    <BaseStepEditor
      icon={ImageIcon}
      title={t("fields.flows.aiEditImage", {
        aiName: t(`aiProviders.${provider}`),
      })}
    >
      <AIEditImageDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
