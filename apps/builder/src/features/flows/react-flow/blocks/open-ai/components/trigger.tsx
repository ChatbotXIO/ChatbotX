import { MultiSelect } from "@/components/multi-select"

import { OpenAIFormItem } from "@/features/flows/react-flow/blocks/open-ai/components/form-item"

interface OpenAITriggerProps {
  value?: string
  onValueChange?: (value: string[]) => void
}

export const OpenAITrigger = ({
  value,
  onValueChange = () => {},
}: OpenAITriggerProps) => {
  const frameworksList = [
    { value: "react", label: "React" },
    { value: "angular", label: "Angular" },
    { value: "vue", label: "Vue" },
    { value: "svelte", label: "Svelte" },
    { value: "ember", label: "Ember" },
  ]

  return (
    <OpenAIFormItem label="All Triggers" isOptions>
      <MultiSelect
        options={frameworksList}
        placeholder="Select frameworks"
        variant="inverted"
        animation={2}
        maxCount={3}
        value={value}
        onValueChange={onValueChange}
      />
    </OpenAIFormItem>
  )
}
