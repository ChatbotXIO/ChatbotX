"use client"

import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"
import { AIModelDialog } from "./components/ai-model-dialog"

type AISpeechToTextEditorProps = {
  parentName: string
}

const AISpeechToTextEditor = (props: AISpeechToTextEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={BotIcon}
      title={t("fields.flows.aiSpeechToText", {
        aiName: t("aiProviders.openai"),
      })}
    >
      <AIModelDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

export default AISpeechToTextEditor
