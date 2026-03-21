import { cn } from "@chatbotx.io/ui/lib/utils"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { Button } from "../ui/button"
import { Calendar } from "../ui/calendar"
import { FormControl } from "../ui/form"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { FormFieldWrapper } from "./field-wrapper"

type CalendarFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  required?: boolean
  placeholder?: string
  description?: string
  defaultValue?: string
  disabled?: boolean
  className?: string
  formItemClassName?: string
  min?: Date
  max?: Date
}

export function CalendarField<T extends FieldValues>({
  name,
  label,
  required,
  placeholder,
  description,
  formItemClassName,
}: CalendarFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      formItemClassName={formItemClassName}
      label={label}
      name={name}
      required={required}
    >
      {(field) => (
        <Popover>
          <PopoverTrigger asChild>
            <FormControl>
              <Button
                className={cn(
                  "w-[240px] pl-3 text-left font-normal",
                  !field.value && "text-muted-foreground",
                )}
                variant={"outline"}
              >
                {field.value ? (
                  format(field.value, "PPP")
                ) : (
                  <span>{placeholder ?? "Pick a date"}</span>
                )}
                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </Button>
            </FormControl>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              captionLayout="dropdown"
              mode="single"
              // biome-ignore lint/suspicious/noExplicitAny: safe ignore
              onSelect={(date) => field.onChange((date ?? undefined) as any)}
              selected={field.value}
            />
          </PopoverContent>
        </Popover>
      )}
    </FormFieldWrapper>
  )
}
