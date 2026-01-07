"use client"

import type { AIGenerateTextProviderType } from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { claudeModelOptions } from "@/features/claude/models"
import { deepseekModelOptions } from "@/features/deepseek/models"
import { geminiModelOptions } from "@/features/gemini/models"
import { openAIChatModelOptions } from "@/features/openai/models"
import { AI_PROVIDER_CONFIGS } from "./config"

const MODEL_OPTIONS_MAP: Record<
  AIGenerateTextProviderType,
  Array<{ label: string; value: string }>
> = {
  openai: openAIChatModelOptions,
  claude: claudeModelOptions,
  gemini: geminiModelOptions,
  deepseek: deepseekModelOptions,
}

type ModelSelectProps = {
  name: string
  provider: AIGenerateTextProviderType
}

export const ModelSelect = (props: ModelSelectProps) => {
  const { name, provider } = props
  const t = useTranslations()

  const modelOptions = useMemo(
    () => MODEL_OPTIONS_MAP[provider] ?? [],
    [provider],
  )

  const placeholder = useMemo(
    () =>
      t(
        AI_PROVIDER_CONFIGS[provider]?.placeholderKey ??
          "fields.placeholders.selectModel",
      ),
    [provider, t],
  )

  return (
    <SelectField
      label={t("fields.model.label")}
      name={name}
      options={modelOptions}
      placeholder={placeholder}
    />
  )
}
