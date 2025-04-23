import type { FieldPath, FieldValues } from "react-hook-form"
import { NumberInput } from "../ui/input-number"
import { FormFieldWrapper } from "./field-wrapper"

interface InputNumberFieldProps<T extends FieldValues> {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
  placeholder?: string
  description?: string
  defaultValue?: number
  className?: string
  step?: number
  min?: number
  max?: number
}

export function InputNumberField<T extends FieldValues>({
  name,
  label,
  isRequired,
  placeholder,
  description,
  ...props
}: InputNumberFieldProps<T>) {
  return (
    <FormFieldWrapper
      name={name}
      label={label}
      isRequired={isRequired}
      description={description}
    >
      {(field) => (
        <NumberInput placeholder={placeholder} {...props} {...field} />
      )}
    </FormFieldWrapper>
  )
}
