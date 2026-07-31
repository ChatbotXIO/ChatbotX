"use client"

import type { AIDeleteMessageHistorySchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
import { StepStateHandles } from "../base/step-state-handles"

type AIDeleteMessageHistoryViewerProps = {
  data: AIDeleteMessageHistorySchema
}

export const AIDeleteMessageHistoryViewer = (
  props: AIDeleteMessageHistoryViewerProps,
) => {
  const { data } = props
  const t = useTranslations()
  const provider = data.provider ?? "openai"

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex w-full items-center justify-center gap-2 text-center font-bold">
        <AIIcon
          label={t("fields.flows.aiDeleteMessageHistory", {
            aiName: t(getAiProviderLabelKey(provider)),
          })}
          provider={provider}
        />
      </div>
      <StepStateHandles states={data.states} />
    </div>
  )
}
