"use client"

import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"
import { AIAnalyzeImageDialog } from "./components/ai-analyze-image-dialog"

type AIAnalyzeImageEditorProps = {
  parentName: string
}

const AIAnalyzeImageEditor = (props: AIAnalyzeImageEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  const { control } = useFormContext()
  const provider = useWatch({ name: `${parentName}.provider`, control })

  return (
    <BaseStepEditor
      icon={BotIcon}
      title={t("flows.aiAnalyzeImage.label", { name: provider })}
    >
      <AIAnalyzeImageDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

export default AIAnalyzeImageEditor
