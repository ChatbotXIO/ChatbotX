"use client"

import type { AIGenerateTextSchema } from "@aha.chat/flow-config"
import { useTranslations } from "next-intl"
import { AI_PROVIDER_CONFIGS } from "./config"

type AIGenerateTextViewerProps = {
  data: AIGenerateTextSchema
}

export const AIGenerateTextViewer = (props: AIGenerateTextViewerProps) => {
  const { data } = props
  const provider = data.provider as "claude" | "openai" | "gemini" | "deepseek"
  const t = useTranslations()
  const config = AI_PROVIDER_CONFIGS[provider]
  const Icon = config.icon

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <Icon className={config.iconColor} size={18} />
      {t("fields.flows.aiGenerateText.label", {
        aiName: t(config.modelLabelKey),
      })}
    </div>
  )
}
