
import { MultiSelect } from "@/components/multi-select"
import { FormItem, FormLabel } from "@/components/ui/form"

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
    <FormItem>
      <FormLabel>
        All Triggers
        <span className="text-[12px] text-gray-500 pl-1">(Options)</span>
      </FormLabel>
      <MultiSelect
        options={frameworksList}
        placeholder="Select frameworks"
        variant="inverted"
        animation={2}
        maxCount={3}
        value={value}
        onValueChange={onValueChange}
      />
    </FormItem>
  )
}
