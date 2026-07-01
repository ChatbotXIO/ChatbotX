import type { FieldPath, FieldValues } from "react-hook-form"
import { MultiSelect, type MultiSelectProps } from "../ui/sersavan/multi-select"
import { FormFieldWrapper } from "./field-wrapper"

type MultiSelectFieldProps<T extends FieldValues> = Omit<
  MultiSelectProps,
  "onValueChange"
> & {
  name: FieldPath<T>
  label?: string
  description?: string
  descriptionType?: "inline" | "tooltip"
  required?: boolean
}

export function MultiSelectField<T extends FieldValues>({
  name,
  label,
  required,
  placeholder,
  description,
  descriptionType = "inline",
  options,
  ...props
}: MultiSelectFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      label={label}
      name={name}
      required={required}
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
