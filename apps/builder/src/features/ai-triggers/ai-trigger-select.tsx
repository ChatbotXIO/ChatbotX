import { FormInput } from "@/components/form-input"
import { MultiSelect } from "@/components/multi-select"
import { Controller, useFormContext } from "react-hook-form"

export const AITriggersMultipleSelect = ({
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
    <FormInput label="AI Triggers" name="aiTriggerIds" isRequired={isRequired}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <MultiSelect
            options={frameworksList}
            onValueChange={() => {}}
            {...field}
          />
        )}
      />
    </FormInput>
  )
}
