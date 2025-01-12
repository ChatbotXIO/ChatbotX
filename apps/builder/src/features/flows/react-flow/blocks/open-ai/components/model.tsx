import { SingleSelect } from "@/components/single-select"

import { FormItem, FormLabel } from "@/components/ui/form"

type OpenAIModelProps = {
  value?: string
  onValueChange: (value: string) => void
}

export const OpenAIModel = ({
  value,
  onValueChange = () => {},
}: OpenAIModelProps) => {
  const models = [
    {
      value: "GPT4oMini",
      label: "gpt 4o mini",
    },
    {
      value: "GPT35Turbo16K",
      label: "gpt 35 turbo 16K",
    },
    {
      value: "GPT4o",
      label: "gpt 4o",
    },
    {
      value: "GPT4",
      label: "gpt 4",
    },
    {
      value: "GPT4Turbo",
      label: "gpt 4 turbo",
    },
    {
      value: "GPT4TurboPreview",
      label: "gpt 4 turbo preview",
    },
    {
      value: "ChatGPT4oLatest",
      label: "chat gpt 4o latest",
    },
    {
      value: "O1Preview",
      label: "o1 preview",
    },
    {
      value: "O1Mini",
      label: "o1 mini",
    },
  ]

  return (
    <FormItem>
      <FormLabel>Model</FormLabel>
      <SingleSelect
        placeholder="Select model Open AI"
        value={value}
        options={models}
        onValueChange={onValueChange}
      />
    </FormItem>
  )
}
