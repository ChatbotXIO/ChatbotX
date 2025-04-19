import { SelectField } from "@/components/form/select-field"
import { BrowserSize } from "@/features/flows/react-flow/steps/button/schema"

export const BrowserSizeSelect = ({
  name,
  label,
  isRequired = true,
}: {
  name: string
  label: string
  isRequired?: boolean
}) => {
  const options = Object.values(BrowserSize).map((size) => ({
    label: `${size}%`,
    value: size,
  }))

  return (
    <SelectField
      name={name}
      label={label}
      isRequired={isRequired}
      placeholder="Please select"
      options={options}
    />
  )
}
