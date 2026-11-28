"use client"

import InputColor from "../ui/vatsalpipalava/input-color"
import { FormFieldWrapper } from "./field-wrapper"

type ColorPickerFieldProps = {
  name: string
  label?: string
  required?: boolean
  description?: string
  descriptionType?: "inline" | "tooltip"
  /** `#RRGGBBAA` when true (default); plain `#RRGGBB` when false. */
  alpha?: boolean
}

export const ColorPickerField = (props: ColorPickerFieldProps) => {
  const {
    name,
    label,
    required,
    description,
    descriptionType = "inline",
    alpha = true,
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
        <InputColor alpha={alpha} className="mt-0" label="" {...field} />
      )}
    </FormFieldWrapper>
  )
}
