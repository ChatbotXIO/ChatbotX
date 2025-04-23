import { SelectField } from "@/components/form/select-field"

export const AIAsistantSelect = ({
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
    <SelectField
      label="Assistants"
      name={name}
      isRequired={isRequired}
      options={frameworksList}
    />
  )
}
