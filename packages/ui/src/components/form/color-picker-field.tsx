"use client"

import InputColor from "../ui/vatsalpipalava/input-color"
import { FormFieldWrapper } from "./field-wrapper"

type ColorPickerFieldProps = {
  name: string
  label?: string
  required?: boolean
  description?: string
  descriptionType?: "inline" | "tooltip"
}

export const ColorPickerField = (props: ColorPickerFieldProps) => {
  const {
    name,
    label,
    required,
    description,
    descriptionType = "inline",
  } = props

  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      label={label}
      name={name}
      required={required}
    >
      {(field) => (
        <InputColor alpha={true} className="mt-0" label="" {...field} />
      )}
    </FormFieldWrapper>
  )
}
