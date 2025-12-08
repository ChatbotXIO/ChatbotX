"use client"

import InputColor from "../ui/vatsalpipalava/input-color"
import { FormFieldWrapper } from "./field-wrapper"

type ColorPickerFieldProps = {
  name: string
  label?: string
  required?: boolean
  description?: string
}

export const ColorPickerField = (props: ColorPickerFieldProps) => {
  const { name, label, required, description } = props

  return (
    <FormFieldWrapper
      description={description}
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
