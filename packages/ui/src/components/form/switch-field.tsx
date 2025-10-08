import type * as SwitchPrimitive from "@radix-ui/react-switch"
import type { FieldPath, FieldValues } from "react-hook-form"
import { Switch } from "../ui/switch"
import { FormFieldWrapper } from "./field-wrapper"

type SwitchFieldProps<T extends FieldValues> = React.ComponentProps<
  typeof SwitchPrimitive.Root
> & {
  name: FieldPath<T>
  label?: string
  required?: boolean
  description?: string
  formItemClassName?: string
}

export function SwitchField<T extends FieldValues>(props: SwitchFieldProps<T>) {
  const { name, label, description, required, formItemClassName, ...rest } = props

  return (
    <FormFieldWrapper
      description={description}
      isRequired={required}
      label={label}
      name={name}
      formItemClassName={formItemClassName}
    >
      {(field) => (
        <Switch
          checked={field.value}
          onCheckedChange={field.onChange}
          {...rest}
          {...field}
        />
      )}
    </FormFieldWrapper>
  )
}
