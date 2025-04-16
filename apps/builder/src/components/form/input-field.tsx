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
  type?: string
}

export function InputField<T extends FieldValues>({
  name,
  label,
  isRequired = true,
  placeholder,
  description,
  type = "text",
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
        <Input type={type} placeholder={placeholder} {...props} {...field} />
      )}
    </FormFieldWrapper>
  )
}
