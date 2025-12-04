"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { GEMINI_MODELS } from "@/features/gemini/models"
import { openAIModelOptions } from "@/features/openai/models"

// Claude model options
const claudeModelOptions = [
  { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-20241022" },
  { label: "Claude 3.5 Haiku", value: "claude-3-5-haiku-20241022" },
  { label: "Claude 3 Opus", value: "claude-3-opus-20240229" },
  { label: "Claude 3 Sonnet", value: "claude-3-sonnet-20240229" },
  { label: "Claude 3 Haiku", value: "claude-3-haiku-20240307" },
]

const deepseekModelOptions = [
  { label: "DeepSeek-V2.5", value: "deepseek-chat" },
  { label: "DeepSeek-V2", value: "deepseek-chat-v2" },
  { label: "DeepSeek-Coder", value: "deepseek-coder" },
  { label: "DeepSeek-Coder-V2", value: "deepseek-coder-v2" },
]

const geminiModelOptions = Object.entries(GEMINI_MODELS).map(
  ([value, config]) => ({
    label: config.label,
    value,
  }),
)

type ModelSelectProps = {
  name: string
  provider: "claude" | "openai" | "gemini" | "deepseek"
}

export const ModelSelect = (props: ModelSelectProps) => {
  const { name, provider } = props
  const t = useTranslations()

  const getModelOptions = () => {
    switch (provider) {
      case "openai":
        return openAIModelOptions
      case "claude":
        return claudeModelOptions
      case "gemini":
        return geminiModelOptions
      case "deepseek":
        return deepseekModelOptions
      default:
        return []
    }
  }

  const getPlaceholderKey = () => {
    switch (provider) {
      case "openai":
        return "fields.placeholders.selectModelOpenAI"
      case "claude":
        return "fields.placeholders.selectModelClaude"
      case "gemini":
        return "fields.placeholders.selectModelGemini"
      case "deepseek":
        return "fields.placeholders.selectModelDeepseek"
      default:
        return "fields.placeholders.selectModel"
    }
  }

  return (
    <SelectField
      label={t("fields.model.label")}
      name={name}
      options={getModelOptions()}
      placeholder={t(getPlaceholderKey())}
    />
  )
}
