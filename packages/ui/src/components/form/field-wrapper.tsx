import { cn } from "@chatbotx.io/ui/lib/utils"
import { InfoIcon } from "lucide-react"
import type { ReactElement } from "react"
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
  /** When set, the tooltip info icon also links to this URL (opens in a new tab). */
  descriptionHref?: string
  /** Suppress the inline error message (e.g. when a sibling control bound to the same field already shows it). */
  hideMessage?: boolean
  formItemClassName?: string
  children: (
    field: {
      value: T[FieldPath<T>]
      onChange: (value: T[FieldPath<T>]) => void
      onBlur: () => void
    },
    description?: string,
  ) => ReactElement
}

export function FormFieldWrapper<T extends FieldValues>({
  name,
  label,
  required,
  description,
  descriptionType = "inline",
  descriptionHref,
  hideMessage = false,
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
                  <TooltipTrigger
                    render={
                      descriptionHref ? (
                        <a
                          aria-label={description}
                          href={descriptionHref}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <InfoIcon
                            aria-hidden="true"
                            className="size-3.5 cursor-help text-muted-foreground"
                          />
                        </a>
                      ) : (
                        <InfoIcon className="size-3.5 cursor-help text-muted-foreground" />
                      )
                    }
                  />
                  <TooltipContent className="max-w-sm">
                    {descriptionHref ? (
                      <a
                        className="underline decoration-dotted underline-offset-2"
                        href={descriptionHref}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {description}
                      </a>
                    ) : (
                      description
                    )}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </FormLabel>
          ) : null}
          <FormControl>{children(field)}</FormControl>
          {description && descriptionType === "inline" ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          {hideMessage ? null : <FormMessage />}
        </FormItem>
      )}
    />
  )
}
