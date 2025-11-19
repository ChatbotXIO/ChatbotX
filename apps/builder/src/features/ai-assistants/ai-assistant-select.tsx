import { SelectField } from "@aha.chat/ui/components/form/select-field"

type AIAsistantSelectProps = {
  name: string
  required?: boolean
}

export const AIAsistantSelect = (props: AIAsistantSelectProps) => {
  const frameworksList = [
    { value: "react", label: "React" },
    { value: "angular", label: "Angular" },
    { value: "vue", label: "Vue" },
    { value: "svelte", label: "Svelte" },
    { value: "ember", label: "Ember" },
  ]

  return <SelectField label="Assistants" options={frameworksList} {...props} />
}
