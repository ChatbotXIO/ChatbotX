import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { GEMINI_MODELS } from "@/features/gemini/models"

const geminiModelOptions = Object.entries(GEMINI_MODELS).map(
  ([value, config]) => ({
    label: config.label,
    value,
  }),
)

type GeminiModelProps = {
  name: string
}

export const GeminiModelSelect = (props: GeminiModelProps) => {
  const { name } = props
  const t = useTranslations()

  return (
    <SelectField
      label={t("fields.model.label")}
      name={name}
      options={geminiModelOptions}
      placeholder={t("fields.placeholders.selectModelGemini")}
    />
  )
}
