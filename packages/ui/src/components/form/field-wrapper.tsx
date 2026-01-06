import { cn } from "@aha.chat/ui/lib/utils"
import { HelpCircleIcon } from "lucide-react"
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
  tooltip?: string
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
  tooltip,
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
              <div className="flex items-center gap-1">
                {label}
                {tooltip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircleIcon className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px]">
                      {tooltip}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
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
