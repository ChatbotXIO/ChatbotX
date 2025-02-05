import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"

export const CustomFieldSelect = ({
  name,
  label,
  allowCreate = false,
}: { name: string; label: string; allowCreate?: boolean }) => {
  // const displayLabel = allowCreate ? <></> : label
  return (
    <FormInput name={name} label={label}>
      <SingleSelect
        value="chatgptResponse"
        options={[{ label: "ChatGPT Response", value: "chatgptResponse" }]}
      />
    </FormInput>
  )
}
