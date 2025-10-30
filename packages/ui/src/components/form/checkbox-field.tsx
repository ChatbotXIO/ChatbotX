import type { FieldPath, FieldValues } from "react-hook-form"
import { Controller } from "react-hook-form"
import { Checkbox } from "../ui/checkbox"
import { Label } from "../ui/label"
import { FormFieldWrapper } from "./field-wrapper"

type CheckboxGroupFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  required?: boolean
  description?: string
  options: {
    value: string
    label: string
  }[]
}

export function CheckboxGroupField<T extends FieldValues>({
  name,
  label,
  required,
  description,
  options,
}: CheckboxGroupFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      required={required}
      label={label}
      name={name}
    >
      {() => (
        <Controller
          name={name}
          render={({ field }) => {
            const valueArray = Array.isArray(field.value)
              ? (field.value as string[])
              : []

            return (
              <div className="space-y-2">
                {options.map((option) => (
                  <div
                    className="flex items-center space-x-2 pb-2"
                    key={option.value}
                  >
                    <Checkbox
                      checked={valueArray.includes(option.value)}
                      // className="h-[36px] w-[36px] bg-white"
                      id={option.value}
                      onCheckedChange={(checked) =>
                        checked
                          ? field.onChange([...valueArray, option.value])
                          : field.onChange(
                              valueArray.filter((v) => v !== option.value),
                            )
                      }
                    />
                    <Label className="font-normal" htmlFor={option.value}>
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            )
          }}
        />
      )}
    </FormFieldWrapper>
  )
}
