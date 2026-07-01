import type { RadioGroupProps } from "@radix-ui/react-radio-group"
import type { FieldPath, FieldValues } from "react-hook-form"
import { Label } from "../ui/label"
import { RadioGroup, RadioGroupItem } from "../ui/radio-group"
import { FormFieldWrapper } from "./field-wrapper"

type RadioGroupFieldProps<T extends FieldValues> = RadioGroupProps & {
  name: FieldPath<T>
  label?: string
  description?: string
  descriptionType?: "inline" | "tooltip"
  orientation?: "horizontal" | "vertical"
  options: {
    value: string
    label: string
  }[]
}

export function RadioGroupField<T extends FieldValues>({
  name,
  label,
  required,
  description,
  descriptionType = "inline",
  orientation = "vertical",
  options,
}: RadioGroupFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      label={label}
      name={name}
      required={required}
    >
      {(field) => (
        <RadioGroup
          className={
            orientation === "horizontal"
              ? "mt-2 flex flex-row flex-wrap gap-4"
              : "mt-2 flex flex-col"
          }
          defaultValue={field.value}
          onValueChange={field.onChange}
        >
          {options.map((option) => (
            <div className="flex items-center space-x-2" key={option.value}>
              <RadioGroupItem
                id={name + option.value}
                key={option.value}
                value={option.value}
              />
              <Label className="font-normal" htmlFor={name + option.value}>
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}
    </FormFieldWrapper>
  )
}
