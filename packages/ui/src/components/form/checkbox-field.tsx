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
    description?: string
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
      label={label}
      name={name}
      required={required}
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
                      id={option.value}
                      onCheckedChange={(checked) =>
                        checked
                          ? field.onChange([...valueArray, option.value])
                          : field.onChange(
                              valueArray.filter((v) => v !== option.value),
                            )
                      }
                    />
                    <div className="flex flex-col gap-0.5">
                      <Label className="font-normal" htmlFor={option.value}>
                        {option.label}
                      </Label>
                      {option.description && (
                        <p className="text-muted-foreground text-xs">
                          {option.description}
                        </p>
                      )}
                    </div>
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
