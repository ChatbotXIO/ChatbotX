import { FormInput } from "@/components/form-input"
import { useFormContext } from "react-hook-form"

export const InputBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: `blocks.${number}`
}) => {
  const { watch } = useFormContext()

  const label = watch(`${parentName}.label`)
  const placeholder = watch(`${parentName}.placeholder`)

  return (
    <div className="w-full flex-1" {...rest}>
      <FormInput
        name={`${parentName}.input`}
        placeholder={placeholder}
        label={label}
      />
    </div>
  )
}
