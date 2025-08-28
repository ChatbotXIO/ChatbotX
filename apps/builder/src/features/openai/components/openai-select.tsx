import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { OPENAI_MODEL_OPTIONS } from "../models"

type OpenAILanguageModelSelectProps = {
  required?: boolean
}

export const OpenAILanguageModelSelect = ({
  required,
}: OpenAILanguageModelSelectProps) => {
  const t = useTranslations()

  return (
    <SelectField
      isRequired={required}
      label={t("fields.openAIModel.label")}
      name="openAIModel"
      options={OPENAI_MODEL_OPTIONS}
    />
  )
}
