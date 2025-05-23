import type { FieldPath, FieldValues } from "react-hook-form"
import { FormFieldWrapper } from "./field-wrapper"
import { Switch } from "../ui/switch"

interface SwitchFieldProps<T extends FieldValues> {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
  placeholder?: string
  description?: string
  defaultValue?: string
  className?: string
}

export function SwitchField<T extends FieldValues>({
  name,
  label,
  isRequired = true,
  placeholder,
  description,
  ...props
}: SwitchFieldProps<T>) {
  return (
    <FormFieldWrapper
      name={name}
      label={label}
      isRequired={isRequired}
      description={description}
    >
      {(field) => (
        <Switch
          checked={field.value}
          onCheckedChange={field.onChange}
          {...props}
          {...field}
        />
      )}
    </FormFieldWrapper>
  )
}
