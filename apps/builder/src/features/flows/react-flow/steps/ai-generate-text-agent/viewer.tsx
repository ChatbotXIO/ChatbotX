"use client"

import type { AIGenerateTextAgentSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { useFlowTemplate } from "../../stores/flow-template-store-provider"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
import { getOpenaiCompatibleStepProviderLabel } from "../ai-generate-text/components/openai-compatible-label"
import { StepStateHandles } from "../base/step-state-handles"

type AIGenerateTextAgentViewerProps = {
  data: AIGenerateTextAgentSchema
}

export const AIGenerateTextAgentViewer = (
  props: AIGenerateTextAgentViewerProps,
) => {
  const { data } = props
  const t = useTranslations()
  const openaiCompatibleIntegrations = useFlowTemplate(
    (store) => store.openaiCompatibleIntegrations,
  )
  const aiName = getOpenaiCompatibleStepProviderLabel({
    fallback: t(`aiProviders.${data.provider}`),
    integrations: openaiCompatibleIntegrations,
    step: data,
  })

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex w-full items-center justify-center gap-2 text-center font-bold">
        <AIIcon
          label={t("fields.flows.aiGenerateTextAgent", {
            aiName,
          })}
          provider={data.provider}
        />
      </div>
      <StepStateHandles states={data.states} />
    </div>
  )
}
