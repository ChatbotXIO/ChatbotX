"use client"

import {
  geminiImageModelOptions,
  openaiImageModelOptions,
} from "@chatbotx.io/ai"
import type { AIGenerateImageProvider } from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import type {
  SelectFieldProps,
  SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import type { FieldValues } from "react-hook-form"

const imageModelOptions: Record<AIGenerateImageProvider, SelectOption[]> = {
  openai: openaiImageModelOptions,
  gemini: geminiImageModelOptions,
}

type AIModelSelectProps = SelectFieldProps<FieldValues> & {
  provider: AIGenerateImageProvider
}

export const AIModelSelect = (props: AIModelSelectProps) => {
  const { provider, ...rest } = props
  const t = useTranslations()

  const options = useMemo(() => imageModelOptions[provider] ?? [], [provider])

  return (
    <ComboboxField
      label={t("fields.model.label")}
      options={options}
      {...rest}
    />
  )
}
