"use client"

import type { AIProvider } from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import type {
  SelectFieldProps,
  SelectOption,
} from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import type { FieldValues } from "react-hook-form"
import { claudeModelOptions } from "@/features/claude/models"
import { deepseekModelOptions } from "@/features/deepseek/models"
import { geminiModelOptions } from "@/features/integration-gemini/schemas/models"
import { openaiChatModelOptions } from "@/features/openai/models"

const modelOptions: Record<AIProvider, SelectOption[]> = {
  openai: openaiChatModelOptions,
  claude: claudeModelOptions,
  gemini: geminiModelOptions,
  deepseek: deepseekModelOptions,
}

type AIModelSelectProps = SelectFieldProps<FieldValues> & {
  provider: AIProvider
}

export const AIModelSelect = (props: AIModelSelectProps) => {
  const { provider, ...rest } = props
  const t = useTranslations()

  const options = useMemo(() => modelOptions[provider] ?? [], [provider])

  return (
    <ComboboxField
      label={t("fields.model.label")}
      options={options}
      {...rest}
    />
  )
}
