import type { ComponentProps } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { Textarea } from "../ui/textarea"
import { FormFieldWrapper } from "./field-wrapper"

type TextareaFieldProps<T extends FieldValues> = ComponentProps<"textarea"> & {
  name: FieldPath<T>
  label?: string
  description?: string
}

export function TextareaField<T extends FieldValues>(
  props: TextareaFieldProps<T>,
) {
  const {
    name,
    label,
    required,
    placeholder,
    description,
    className,
    ...rest
  } = props

  return (
    <FormFieldWrapper
      description={description}
      required={required}
      label={label}
      name={name}
    >
      {(field) => <Textarea placeholder={placeholder} {...rest} {...field} />}
    </FormFieldWrapper>
  )
}
