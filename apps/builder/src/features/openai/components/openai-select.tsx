import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { OPENAI_MODEL_OPTIONS } from "../models"

type OpenAILanguageModelSelectProps = {
  required?: boolean
}

export const OpenAILanguageModelSelect = ({
  required,
}: OpenAILanguageModelSelectProps) => {
  return (
    <SelectField
      isRequired={required}
      label="OpenAI Model"
      name="openAIModel"
      options={OPENAI_MODEL_OPTIONS}
    />
  )
}
