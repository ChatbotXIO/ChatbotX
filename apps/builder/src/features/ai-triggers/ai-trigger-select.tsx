import { MultiSelectField } from "@/components/form/select-field"

export const AITriggersMultipleSelect = ({
  name,
  isRequired = true,
}: {
  name: string
  isRequired?: boolean
}) => {
  const frameworksList = [
    { value: "react", label: "React" },
    { value: "angular", label: "Angular" },
    { value: "vue", label: "Vue" },
    { value: "svelte", label: "Svelte" },
    { value: "ember", label: "Ember" },
  ]

  return (
    <MultiSelectField
      label="AI Triggers"
      name={name}
      isRequired={isRequired}
      options={frameworksList}
    />
  )
}
