import type { FieldPath, FieldValues } from "react-hook-form"
import { NumberInput } from "../ui/input-number"
import { FormFieldWrapper } from "./field-wrapper"

type InputNumberFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  required?: boolean
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
  required,
  placeholder,
  description,
  ...props
}: InputNumberFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      required={required}
      label={label}
      name={name}
    >
      {(field) => (
        <NumberInput placeholder={placeholder} {...props} {...field} />
      )}
    </FormFieldWrapper>
  )
}
