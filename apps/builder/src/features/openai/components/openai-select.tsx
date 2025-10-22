import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { openAIModelOptions } from "../models"

type OpenAILanguageModelSelectProps = {
  required?: boolean
}

export const OpenAILanguageModelSelect = ({
  required,
}: OpenAILanguageModelSelectProps) => {
  const t = useTranslations()

  return (
    <SelectField
      label={t("fields.openAIModel.label")}
      name="openAIModel"
      options={openAIModelOptions}
      required={required}
    />
  )
}
