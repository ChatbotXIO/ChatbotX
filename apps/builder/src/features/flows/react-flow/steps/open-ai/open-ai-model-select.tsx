import { SelectField } from "@/components/form/select-field"
import { openAIModelOptions } from "@/features/integration-openai/schemas"

type OpenAIModelProps = {
  name: string
}

export const OpenAIModel = ({ name }: OpenAIModelProps) => {
  return (
    <SelectField
      name={name}
      label="Model"
      placeholder="Select model Open AI"
      options={openAIModelOptions}
    />
  )
}
