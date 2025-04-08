import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { Controller, useFormContext } from "react-hook-form"

export const AIAgentSelect = ({
  name,
  isRequired = true,
}: { name: string; isRequired?: boolean }) => {
  const { control } = useFormContext()

  const frameworksList = [
    { value: "react", label: "React" },
    { value: "angular", label: "Angular" },
    { value: "vue", label: "Vue" },
    { value: "svelte", label: "Svelte" },
    { value: "ember", label: "Ember" },
  ]

  return (
    <FormInput label="Agents" name="aiAgentId" isRequired={isRequired}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <SingleSelect
            options={frameworksList}
            onValueChange={() => {}}
            {...field}
          />
        )}
      />
    </FormInput>
  )
}
