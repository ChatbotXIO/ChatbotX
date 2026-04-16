import type { AIGenerateImageProvider } from "@chatbotx.io/flow-config"
import {
  SelectField,
  type SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

type QualitySelectProps = {
  name: string
  required?: boolean
}

export const QualitySelect = (props: QualitySelectProps) => {
  const t = useTranslations()

  const options = [
    { label: t("fields.quality.options.auto"), value: "auto" },
    { label: t("fields.quality.options.hd"), value: "hd" },
    { label: t("fields.quality.options.md"), value: "md" },
    { label: t("fields.quality.options.ld"), value: "ld" },
  ]

  return (
    <SelectField
      label={t("fields.quality.label")}
      {...props}
      options={options}
    />
  )
}

type SizeSelectProps = {
  name: string
  required?: boolean
  provider: AIGenerateImageProvider
}

export const SizeSelect = (props: SizeSelectProps) => {
  const { provider, ...rest } = props
  const t = useTranslations()

  const optionsMap = useMemo<Record<AIGenerateImageProvider, SelectOption[]>>(
    () => ({
      openai: [
        { label: t("fields.size.options.auto"), value: "auto" },
        { label: t("fields.size.options.square1024"), value: "1024x1024" },
        {
          label: t("fields.size.options.landscape1536x1024"),
          value: "1536x1024",
        },
        {
          label: t("fields.size.options.portrait1024x1536"),
          value: "1024x1536",
        },
        { label: t("fields.size.options.dalle2_256"), value: "256x256" },
        { label: t("fields.size.options.dalle2_512"), value: "512x512" },
        {
          label: t("fields.size.options.dalle3_1792x1024"),
          value: "1792x1024",
        },
      ],
      gemini: [
        { label: t("fields.size.options.auto"), value: "auto" },
        { label: "1:1", value: "1:1" },
        { label: "3:4", value: "3:4" },
        { label: "4:3", value: "4:3" },
        { label: "9:16", value: "9:16" },
        { label: "16:9", value: "16:9" },
      ],
    }),
    [t],
  )

  return (
    <SelectField
      label={t("fields.size.label")}
      {...rest}
      options={optionsMap[provider] ?? []}
    />
  )
}
