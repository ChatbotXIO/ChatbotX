"use client"

import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { useFlowTemplate } from "../../stores/flow-template-store-provider"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
import { getOpenaiCompatibleStepProviderLabel } from "../ai-generate-text/components/openai-compatible-label"
import { BaseStepEditor } from "../base/editor"
import { AIModelDialog } from "./components/ai-model-dialog"

type AIGenerateTextAgentEditorProps = {
  parentName: string
}

export const AIGenerateTextAgentEditor = (
  props: AIGenerateTextAgentEditorProps,
) => {
  const { parentName } = props
  const t = useTranslations()

  const { getValues } = useFormContext()
  const step = getValues(parentName)
  const provider = step.provider
  const openaiCompatibleIntegrations = useFlowTemplate(
    (store) => store.openaiCompatibleIntegrations,
  )
  const aiName = getOpenaiCompatibleStepProviderLabel({
    fallback: t(`aiProviders.${provider}`),
    integrations: openaiCompatibleIntegrations,
    step,
  })

  return (
    <BaseStepEditor
      iconNode={<AIIcon provider={provider} showLabel={false} />}
      title={t("fields.flows.aiGenerateTextAgent", {
        aiName,
      })}
    >
      <AIModelDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
