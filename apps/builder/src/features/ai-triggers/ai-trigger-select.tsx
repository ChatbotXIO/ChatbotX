import { MultiSelectField } from "@aha.chat/ui/components/form/select-field"

type AITriggersMultipleSelectProps = {
  name: string
  isRequired?: boolean
}

export const AITriggersMultipleSelect = (
  props: AITriggersMultipleSelectProps,
) => {
  const frameworksList = [
    { value: "react", label: "React" },
    { value: "angular", label: "Angular" },
    { value: "vue", label: "Vue" },
    { value: "svelte", label: "Svelte" },
    { value: "ember", label: "Ember" },
  ]

  return (
    <MultiSelectField label="AI Triggers" options={frameworksList} {...props} />
  )
}
