import type { RadioGroupProps } from "@radix-ui/react-radio-group"
import type { FieldPath, FieldValues } from "react-hook-form"
import { Label } from "../ui/label"
import { RadioGroup, RadioGroupItem } from "../ui/radio-group"
import { FormFieldWrapper } from "./field-wrapper"

type RadioGroupFieldProps<T extends FieldValues> = RadioGroupProps & {
  name: FieldPath<T>
  label?: string
  description?: string
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
  options,
}: RadioGroupFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      required={required}
      label={label}
      name={name}
    >
      {(field) => (
        <RadioGroup
          className="flex flex-col"
          defaultValue={field.value}
          onValueChange={field.onChange}
        >
          {options.map((option) => (
            <div className="flex items-center space-x-2" key={option.value}>
              <RadioGroupItem
                id={option.value}
                key={option.value}
                value={option.value}
              />
              <Label className="font-normal" htmlFor={option.value}>
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}
    </FormFieldWrapper>
  )
}
