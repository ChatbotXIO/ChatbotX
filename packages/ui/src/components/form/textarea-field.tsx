import type { FieldPath, FieldValues } from "react-hook-form"
import { Textarea } from "../ui/textarea"
import { FormFieldWrapper } from "./field-wrapper"

type TextareaFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
  placeholder?: string
  description?: string
  type?: string
  className?: string
}

export function TextareaField<T extends FieldValues>({
  name,
  label,
  isRequired,
  placeholder,
  description,
  type = "text",
  ...props
}: TextareaFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      isRequired={isRequired}
      label={label}
      name={name}
    >
      {(field) => <Textarea placeholder={placeholder} {...props} {...field} />}
    </FormFieldWrapper>
  )
}
