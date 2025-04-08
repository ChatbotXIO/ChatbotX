import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
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
    <FormInput name={name} label={label} isRequired={isRequired}>
      <SingleSelect name={name} placeholder="Please select" options={options} />
    </FormInput>
  )
}
