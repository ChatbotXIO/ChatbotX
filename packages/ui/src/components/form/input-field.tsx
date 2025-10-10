import type { FieldPath, FieldValues } from "react-hook-form"
import { Input } from "../ui/input"
import { FormFieldWrapper } from "./field-wrapper"

type InputFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
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
  isRequired = true,
  placeholder,
  description,
  type = "text",
  formItemClassName,
  ...props
}: InputFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      isRequired={isRequired}
      label={label}
      name={name}
      formItemClassName={formItemClassName}
    >
      {(field) => (
        <Input placeholder={placeholder} type={type} {...props} {...field} />
      )}
    </FormFieldWrapper>
  )
}
