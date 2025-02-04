import { FormSelect } from "@/components/form-select"
import { useFormContext } from "react-hook-form"

export const SelectBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: `blocks.${number}`
}) => {
  const { watch } = useFormContext()

  const label = watch(`${parentName}.label`)
  const placeholder = watch(`${parentName}.placeholder`)
  const items: Array<{ name: string; value: string }> = watch(
    `${parentName}.items`,
  )

  return (
    <div className="w-full flex-1" {...rest}>
      <FormSelect
        name={`${parentName}.selected`}
        placeholder={placeholder}
        label={label}
        items={items}
      />
    </div>
  )
}
