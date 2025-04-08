import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { openAIModelOptions } from "@/features/integration-openai/schemas"

type OpenAIModelProps = {
  name: string
}

export const OpenAIModel = ({ name }: OpenAIModelProps) => {
  return (
    <FormInput name={name} label="Model">
      <SingleSelect
        name={name}
        placeholder="Select model Open AI"
        options={openAIModelOptions}
      />
    </FormInput>
  )
}
