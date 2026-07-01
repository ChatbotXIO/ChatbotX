import type { ComponentProps } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { Textarea } from "../ui/textarea"
import { FormFieldWrapper } from "./field-wrapper"

type TextareaFieldProps<T extends FieldValues> = ComponentProps<"textarea"> & {
  name: FieldPath<T>
  label?: string
  description?: string
  descriptionType?: "inline" | "tooltip"
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
    descriptionType = "inline",
    className,
    ...rest
  } = props

  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      label={label}
      name={name}
      required={required}
    >
      {(field) => <Textarea placeholder={placeholder} {...rest} {...field} />}
    </FormFieldWrapper>
  )
}
