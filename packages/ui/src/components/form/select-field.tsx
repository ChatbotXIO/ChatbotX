import type { FieldPath, FieldValues } from "react-hook-form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { FormFieldWrapper } from "./field-wrapper"

type SelectFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
  placeholder?: string
  description?: string
  defaultValue?: string
  options: { value: string; label: string }[]
  className?: string
} & React.ComponentProps<typeof Select>

function SelectClear({
  className,
  children,
  value = null as unknown as string,
  ...props
}: Omit<React.ComponentProps<typeof SelectItem>, "value"> & {
  value?: string
}) {
  return (
    <SelectItem className="opacity-50" key={"reset"} value={value} {...props}>
      {children ?? "Reset"}
    </SelectItem>
  )
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
      description={description}
      isRequired={isRequired}
      label={label}
      name={name}
    >
      {(field) => (
        <Select
          defaultValue={field.value}
          onValueChange={field.onChange}
          {...props}
          {...field}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectClear />
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
