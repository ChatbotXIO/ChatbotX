import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { openAIModelOptions } from "@/features/integration-openai/schemas"

type OpenAIModelProps = {
  name: string
}

export const OpenAIModelSelect = (props: OpenAIModelProps) => {
  const { name } = props

  return (
    <SelectField
      label="Model"
      name={name}
      options={openAIModelOptions}
      placeholder="Select model Open AI"
    />
  )
}
