import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"

type GeminiLanguageModelSelectProps = {
  required?: boolean
}

export const GeminiLanguageModelSelect = ({
  required,
}: GeminiLanguageModelSelectProps) => {
  const t = useTranslations()

  return (
    <SelectField
      label={t("fields.geminiModel.label")}
      name="geminiModel"
      options={[]}
      required={required}
    />
  )
}
