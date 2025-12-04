import type { FieldPath, FieldValues } from "react-hook-form"
import { Input } from "../ui/input"
import { FormFieldWrapper } from "./field-wrapper"

type InputFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  required?: boolean
  placeholder?: string
  description?: string
  defaultValue?: string
  disabled?: boolean
  className?: string
  formItemClassName?: string
  type?:
    | "text"
    | "password"
    | "email"
    | "number"
    | "tel"
    | "url"
    | "search"
    | "hidden"
}

export function InputField<T extends FieldValues>({
  name,
  label,
  required,
  placeholder,
  description,
  type = "text",
  formItemClassName,
  ...props
}: InputFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      formItemClassName={formItemClassName}
      label={label}
      name={name}
      required={required}
    >
      {(field) => (
        <Input placeholder={placeholder} type={type} {...props} {...field} />
      )}
    </FormFieldWrapper>
  )
}
