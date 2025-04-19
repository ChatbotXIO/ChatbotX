import type { FieldPath, FieldValues } from "react-hook-form"
import { Textarea } from "../ui/textarea"
import { FormFieldWrapper } from "./field-wrapper"

interface TextareaFieldProps<T extends FieldValues> {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
  placeholder?: string
  description?: string
  type?: string
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
      name={name}
      label={label}
      isRequired={isRequired}
      description={description}
    >
      {(field) => <Textarea placeholder={placeholder} {...props} {...field} />}
    </FormFieldWrapper>
  )
}
