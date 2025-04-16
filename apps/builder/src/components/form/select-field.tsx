import type { FieldPath, FieldValues } from "react-hook-form"
import { MultiSelect } from "../multi-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { FormFieldWrapper } from "./field-wrapper"

interface SelectFieldProps<T extends FieldValues> {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
  placeholder?: string
  description?: string
  defaultValue?: string
  options: { value: string; label: string }[]
}

export function SelectField<T extends FieldValues>({
  name,
  label,
  isRequired,
  placeholder,
  description,
  options,
  ...props
}: SelectFieldProps<T>) {
  return (
    <FormFieldWrapper<T>
      name={name}
      label={label}
      isRequired={isRequired}
      description={description}
    >
      {(field) => (
        <Select
          onValueChange={(val) => {
            field.onChange(val as T[FieldPath<T>])
          }}
          value={field.value ? String(field.value) : ""}
          {...props}
        >
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormFieldWrapper>
  )
}

export function MultiSelectField<T extends FieldValues>({
  name,
  label,
  isRequired,
  placeholder,
  description,
  options,
  ...props
}: SelectFieldProps<T> & { defaultValue?: string[] }) {
  return (
    <FormFieldWrapper<T>
      name={name}
      label={label}
      isRequired={isRequired}
      description={description}
    >
      {(field) => (
        <MultiSelect
          options={options}
          onValueChange={() => {}}
          {...props}
          {...field}
        />
      )}
    </FormFieldWrapper>
  )
}
