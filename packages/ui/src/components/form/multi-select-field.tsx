import type { FieldPath, FieldValues } from "react-hook-form"
import { MultiSelect, type MultiSelectProps } from "../ui/multi-select"
import { FormFieldWrapper } from "./field-wrapper"

type MultiSelectFieldProps<T extends FieldValues> = Omit<
  MultiSelectProps,
  "onValueChange"
> & {
  name: FieldPath<T>
  label?: string
  description?: string
  required?: boolean
}

export function MultiSelectField<T extends FieldValues>({
  name,
  label,
  required,
  placeholder,
  description,
  options,
  ...props
}: MultiSelectFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      required={required}
      label={label}
      name={name}
    >
      {(field) => (
        <MultiSelect
          defaultValue={field.value}
          modalPopover={true}
          onValueChange={(value) => field.onChange(value as T[FieldPath<T>])}
          options={options}
          {...props}
          {...field}
        />
      )}
    </FormFieldWrapper>
  )
}
