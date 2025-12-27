import { cn } from "@aha.chat/ui/lib/utils"
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
  required?: boolean
  description?: string
  formItemClassName?: string
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
  required,
  description,
  formItemClassName,
  children,
}: FormFieldWrapperProps<T>) {
  const { control } = useFormContext()

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("w-full", formItemClassName)}>
          {label ? (
            <FormLabel className="flex gap-1">
              {label}
              {!required && (
                <span className="self-start font-normal text-xxs">
                  (optional)
                </span>
              )}
            </FormLabel>
          ) : null}
          <FormControl>{children(field)}</FormControl>
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
