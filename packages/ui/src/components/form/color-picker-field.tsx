"use client"

import { useState } from "react"
import { HexColorPicker } from "react-colorful"
import { useFormContext } from "react-hook-form"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { FormFieldWrapper } from "./field-wrapper"

type ColorPickerFieldProps = {
  name: string
  label?: string
  required?: boolean
  description?: string
}

export const ColorPickerField = (props: ColorPickerFieldProps) => {
  const { name, label, required, description } = props

  const { getValues, setValue } = useFormContext()
  const [color, setColor] = useState(getValues("name") ?? "#000000")
  const [open, setOpen] = useState(false)

  return (
    <FormFieldWrapper
      description={description}
      required={required}
      label={label}
      name={name}
    >
      {(field) => (
        <Popover onOpenChange={setOpen} open={open}>
          <PopoverTrigger asChild>
            <div
              className="h-8 w-8 rounded-md shadow-sm"
              style={{ backgroundColor: field.value }}
            >
              {" "}
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] rounded-b-none p-0" side="right">
            <div className="flex flex-col gap-1">
              <HexColorPicker color={color} onChange={setColor} />

              <Input
                maxLength={7}
                onChange={(e) => {
                  setColor(e?.currentTarget?.value)
                }}
                value={color}
              />
            </div>

            <div className="flex justify-end px-4 py-2">
              <Button
                onClick={() => {
                  setValue(name, color)
                  setOpen(false)
                }}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </FormFieldWrapper>
  )
}
