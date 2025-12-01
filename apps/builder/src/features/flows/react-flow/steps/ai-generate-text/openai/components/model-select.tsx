import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { openAIModelOptions } from "@/features/openai/models"

type OpenAIModelSelectProps = {
  name: string
}

export const OpenAIModelSelect = (props: OpenAIModelSelectProps) => {
  const { name } = props
  const t = useTranslations()

  return (
    <SelectField
      label={t("fields.model.label")}
      name={name}
      options={openAIModelOptions}
      placeholder={t("fields.placeholders.selectModelOpenAI")}
    />
  )
}
