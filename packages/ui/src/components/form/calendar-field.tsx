import type { FieldPath, FieldValues } from "react-hook-form"
import { Input } from "../ui/input"
import { FormFieldWrapper } from "./field-wrapper"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { FormControl } from "../ui/form"
import { Button } from "../ui/button"
import { cn } from "@aha.chat/ui/lib/utils"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Calendar } from "../ui/calendar"

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
  min,
  max,
}: CalendarFieldProps<T>) {
  console.log("min", min)
  console.log("max", max)
  return (
    <FormFieldWrapper
      description={description}
      required={required}
      label={label}
      name={name}
      formItemClassName={formItemClassName}
    >
      {(field) => (
        <Popover>
          <PopoverTrigger asChild>
            <FormControl>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] pl-3 text-left font-normal",
                  !field.value && "text-muted-foreground"
                )}
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
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={field.value}
              onSelect={(date) => field.onChange((date ?? undefined) as any)}
              captionLayout="dropdown"
            />
          </PopoverContent>
        </Popover>
      )}
    </FormFieldWrapper>
  )
}
