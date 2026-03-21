import type { FieldPath, FieldValues } from "react-hook-form"
import { NumberInput, type NumberInputProps } from "../ui/input-number"
import { FormFieldWrapper } from "./field-wrapper"

type InputNumberFieldProps<T extends FieldValues> = NumberInputProps & {
  name: FieldPath<T>
  formItemClassName?: string
  label?: string
  required?: boolean
  description?: string
  className?: string
}

export function InputNumberField<T extends FieldValues>({
  name,
  label,
  required,
  description,
  formItemClassName,
  prefix,
  suffix,
  className,
  ...props
}: InputNumberFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      formItemClassName={formItemClassName}
      label={label}
      name={name}
      required={required}
    >
      {(field) => (
        <div className="flex items-center gap-2">
          {prefix && <span className="text-muted-foreground">{prefix}</span>}
          <NumberInput {...props} {...field} />
          {suffix && <span className="text-muted-foreground">{suffix}</span>}
        </div>
      )}
    </FormFieldWrapper>
  )
}
