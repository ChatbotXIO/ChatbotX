"use client"

import {
  AIGenerateImageProvider,
  type AIGenerateImageSchema,
} from "@aha.chat/flow-config"
import { useTranslations } from "next-intl"
import { AI_PROVIDER_CONFIGS } from "./config"

type AIGenerateImageViewerProps = {
  data: AIGenerateImageSchema
}

const AIGenerateImageViewer = (props: AIGenerateImageViewerProps) => {
  const { data } = props
  const provider = data.provider || AIGenerateImageProvider.openai
  const t = useTranslations()
  const config =
    AI_PROVIDER_CONFIGS[provider as keyof typeof AI_PROVIDER_CONFIGS] ||
    AI_PROVIDER_CONFIGS[AIGenerateImageProvider.openai]
  const Icon = config.icon

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <Icon className={config.iconColor} size={18} />
      {t("fields.flows.aiGenerateImage.label", {
        aiName: t(config.modelLabelKey),
      })}
    </div>
  )
}

export default AIGenerateImageViewer
