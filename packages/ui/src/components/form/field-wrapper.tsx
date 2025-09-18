import type { ReactNode } from "react"
import {
  type FieldPath,
  type FieldValues,
  useFormContext,
} from "react-hook-form"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form"

type FormFieldWrapperProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  placeholder?: string
  isRequired?: boolean
  description?: string
  children: (
    field: {
      value: T[FieldPath<T>]
      onChange: (value: T[FieldPath<T>]) => void
      onBlur: () => void
    },
    description?: string,
  ) => ReactNode
}

export function FormFieldWrapper<T extends FieldValues>({
  name,
  label,
  isRequired,
  description,
  children,
}: FormFieldWrapperProps<T>) {
  const { control } = useFormContext()

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="w-full">
          {label && (
            <FormLabel className="flex gap-1">
              {label}
              {!isRequired && (
                <span className="self-start font-normal text-xxs">
                  (optional)
                </span>
              )}
            </FormLabel>
          )}
          <FormControl>{children(field)}</FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
