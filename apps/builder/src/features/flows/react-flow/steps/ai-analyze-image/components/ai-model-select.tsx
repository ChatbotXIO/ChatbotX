import {
  claudeAnalyzeImageModelOptions,
  geminiAnalyzeImageModelOptions,
  openaiAnalyzeImageModelOptions,
} from "@chatbotx.io/ai"
import type { AIAnalyzeImageProvider } from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import type {
  SelectFieldProps,
  SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import type { FieldValues } from "react-hook-form"

const analyzeModelOptions: Record<AIAnalyzeImageProvider, SelectOption[]> = {
  openai: openaiAnalyzeImageModelOptions,
  gemini: geminiAnalyzeImageModelOptions,
  claude: claudeAnalyzeImageModelOptions,
}

type AIModelSelectProps = SelectFieldProps<FieldValues> & {
  provider: AIAnalyzeImageProvider
}

export const AIModelSelect = (props: AIModelSelectProps) => {
  const { provider, ...rest } = props
  const t = useTranslations()

  const options = useMemo(() => analyzeModelOptions[provider] ?? [], [provider])

  return (
    <ComboboxField
      label={t("fields.model.label")}
      options={options}
      {...rest}
    />
  )
}
