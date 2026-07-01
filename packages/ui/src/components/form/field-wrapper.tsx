import { cn } from "@chatbotx.io/ui/lib/utils"
import { InfoIcon } from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"

type FormFieldWrapperProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  placeholder?: string
  required?: boolean
  description?: string
  descriptionType?: "inline" | "tooltip"
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
  descriptionType = "inline",
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
            <FormLabel className="flex items-center gap-1">
              {label}
              {!required && (
                <span className="self-start font-normal text-xxs">
                  (optional)
                </span>
              )}
              {description && descriptionType === "tooltip" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="size-3.5 cursor-help text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {description}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </FormLabel>
          ) : null}
          <FormControl>{children(field)}</FormControl>
          {description && descriptionType === "inline" ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
