"use client"

import type { AIProvider } from "@chatbotx.io/ai"
import {
  claudeModelOptions,
  deepseekModelOptions,
  geminiModelOptions,
  openaiModelOptions,
} from "@chatbotx.io/ai"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import type {
  SelectFieldProps,
  SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import type { FieldValues } from "react-hook-form"

const modelOptions: Record<AIProvider, SelectOption[]> = {
  openai: openaiModelOptions,
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
