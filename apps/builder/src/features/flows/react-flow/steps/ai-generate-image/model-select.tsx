import {
  AIGenerateImageProvider,
  DEFAULT_IMAGE_MODEL_IDS,
} from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { AI_PROVIDER_CONFIGS } from "./config"

const OPENAI_IMAGE_MODELS = [
  {
    label: "GPT Image 1",
    value: DEFAULT_IMAGE_MODEL_IDS[AIGenerateImageProvider.openai],
  },
  { label: "DALL-E 3", value: "dall-e-3" },
  { label: "DALL-E 2", value: "dall-e-2" },
]

const GEMINI_IMAGE_MODELS = [
  {
    label: "Imagen 3",
    value: DEFAULT_IMAGE_MODEL_IDS[AIGenerateImageProvider.gemini],
  },
]

const MODEL_OPTIONS_MAP: Record<
  string,
  Array<{ label: string; value: string }>
> = {
  [AIGenerateImageProvider.openai]: OPENAI_IMAGE_MODELS,
  [AIGenerateImageProvider.gemini]: GEMINI_IMAGE_MODELS,
}

type ModelSelectProps = {
  name: string
}

export const ModelSelect = (props: ModelSelectProps) => {
  const { name } = props
  const t = useTranslations()
  const { watch } = useFormContext()
  const provider = watch("provider") || AIGenerateImageProvider.openai

  const modelOptions = useMemo(
    () => MODEL_OPTIONS_MAP[provider] ?? [],
    [provider],
  )

  const placeholder = useMemo(
    () =>
      t(
        AI_PROVIDER_CONFIGS[provider as keyof typeof AI_PROVIDER_CONFIGS]
          ?.placeholderKey ??
          AI_PROVIDER_CONFIGS[AIGenerateImageProvider.openai].placeholderKey,
      ),
    [provider, t],
  )

  return (
    <SelectField
      label={t("fields.model.label")}
      name={name}
      options={modelOptions}
      placeholder={placeholder}
      required
    />
  )
}
