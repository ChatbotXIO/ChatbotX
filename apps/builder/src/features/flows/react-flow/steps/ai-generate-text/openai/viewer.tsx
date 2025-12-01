"use client"

import { AI_PROVIDER_CONFIGS } from "../../shared/ai-generate-text/config"
import { GenerateTextViewer } from "../../shared/ai-generate-text/generate-text-viewer"

export const OpenAIGenerateTextViewer = () => {
  const config = AI_PROVIDER_CONFIGS.openai
  return (
    <GenerateTextViewer
      icon={config.icon}
      iconColor={config.iconColor}
      modelLabelKey={config.modelLabelKey}
    />
  )
}
