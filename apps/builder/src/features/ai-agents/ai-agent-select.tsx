import { SelectField } from "@aha.chat/ui/components/form/select-field"

type AIAgentSelectProps = {
  name: string
  isRequired?: boolean
}

export const AIAgentSelect = (props: AIAgentSelectProps) => {
  const frameworksList = [
    { value: "react", label: "React" },
    { value: "angular", label: "Angular" },
    { value: "vue", label: "Vue" },
    { value: "svelte", label: "Svelte" },
    { value: "ember", label: "Ember" },
  ]

  return <SelectField label="Agents" options={frameworksList} {...props} />
}
