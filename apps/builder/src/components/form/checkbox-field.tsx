import type { FieldPath, FieldValues } from "react-hook-form"
import { Controller } from "react-hook-form"
import { Label } from "../ui/label"
import { Checkbox } from "../ui/checkbox"
import { FormFieldWrapper } from "./field-wrapper"

interface CheckboxGroupFieldProps<T extends FieldValues> {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
  description?: string
  options: {
    value: string
    label: string
  }[]
}

export function CheckboxGroupField<T extends FieldValues>({
  name,
  label,
  isRequired,
  description,
  options,
}: CheckboxGroupFieldProps<T>) {
  return (
    <FormFieldWrapper
      name={name}
      label={label}
      isRequired={isRequired}
      description={description}
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
                    key={option.value}
                    className="flex items-center space-x-2 pb-2"
                  >
                    <Checkbox
                      id={option.value}
                      checked={valueArray.includes(option.value)}
                      className="bg-white h-[36px] w-[36px]"
                      onCheckedChange={(checked) =>
                        checked
                          ? field.onChange([...valueArray, option.value])
                          : field.onChange(
                              valueArray.filter((v) => v !== option.value),
                            )
                      }
                    />
                    <Label htmlFor={option.value} className="text-[18px] ml-2">
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
