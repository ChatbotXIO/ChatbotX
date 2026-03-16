import type { ComponentProps } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { Input } from "../ui/input"
import { FormFieldWrapper } from "./field-wrapper"

type InputFieldProps<T extends FieldValues> = ComponentProps<"input"> & {
  name: FieldPath<T>
  label?: string
  description?: string
  formItemClassName?: string
}

export function InputField<T extends FieldValues>({
  name,
  label,
  required,
  description,
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
      {(field) => <Input {...props} {...field} />}
    </FormFieldWrapper>
  )
}
