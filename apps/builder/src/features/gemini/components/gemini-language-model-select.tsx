import { SelectField } from "@aha.chat/ui/components/form/select-field"

type GeminiLanguageModelSelectProps = {
  required?: boolean
}

export const GeminiLanguageModelSelect = ({
  required,
}: GeminiLanguageModelSelectProps) => {
  return (
    <SelectField
      isRequired={required}
      label="Gemini Model"
      name="geminiModel"
      options={[]}
    />
  )
}
