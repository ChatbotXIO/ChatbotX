"use client"

import { useState } from "react"
import { HexColorPicker } from "react-colorful"
import { useFormContext } from "react-hook-form"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { FormFieldWrapper } from "./field-wrapper"
import InputColor from "../ui/vatsalpipalava/input-color"

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
        <InputColor
          alpha={true}
          className="mt-0"
          label=""
          {...field}
        />
      )}
    </FormFieldWrapper>
  )
}
