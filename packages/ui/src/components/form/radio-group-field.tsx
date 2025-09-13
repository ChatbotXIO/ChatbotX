import type { RadioGroupProps } from "@radix-ui/react-radio-group"
import type { FieldPath, FieldValues } from "react-hook-form"
import { Controller } from "react-hook-form"
import { FormControl, FormItem, FormLabel } from "../ui/form"
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
      isRequired={required}
      label={label}
      name={name}
    >
      {() => (
        <Controller
          name={name}
          render={({ field }) => {
            return (
              <RadioGroup
                className="mt-2 flex flex-col"
                defaultValue={field.value}
                onValueChange={field.onChange}
              >
                {options.map((option) => (
                  <FormItem
                    className="flex items-center gap-3"
                    key={option.value}
                  >
                    <FormControl>
                      <RadioGroupItem value={option.value} />
                    </FormControl>
                    <FormLabel className="font-normal">
                      {option.label}
                    </FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            )
          }}
        />
      )}
    </FormFieldWrapper>
  )
}
