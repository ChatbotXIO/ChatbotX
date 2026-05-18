"use client"

import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"
import { AIModelDialog } from "./components/ai-model-dialog"

type AITextToSpeechEditorProps = {
  parentName: string
}

const AITextToSpeechEditor = ({ parentName }: AITextToSpeechEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={BotIcon}
      title={t("fields.flows.aiTextToSpeech", {
        aiName: t("aiProviders.openai"),
      })}
    >
      <AIModelDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

export default AITextToSpeechEditor
