import type { FieldPath, FieldValues } from "react-hook-form"
import { Input } from "../ui/input"
import { FormFieldWrapper } from "./field-wrapper"

interface InputFieldProps<T extends FieldValues> {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
  placeholder?: string
  description?: string
  defaultValue?: string
  disabled?: boolean
  className?: string
}

export function InputField<T extends FieldValues>({
  name,
  label,
  isRequired = true,
  placeholder,
  description,
  ...props
}: InputFieldProps<T>) {
  return (
    <FormFieldWrapper
      name={name}
      label={label}
      isRequired={isRequired}
      description={description}
    >
      {(field) => (
        <Input type={"text"} placeholder={placeholder} {...props} {...field} />
      )}
    </FormFieldWrapper>
  )
}
