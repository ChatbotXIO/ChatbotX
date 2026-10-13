"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Calendar } from "@chatbotx.io/ui/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CalendarIcon } from "lucide-react"
import { useFormatter } from "next-intl"
import type { FieldPath, FieldValues } from "react-hook-form"
import { formatLocalDate, toLocalDateString, toPickerDate } from "./local-date"

type LocalDatePickerProps = {
  value: string | undefined
  onChange: (value: string) => void
  ariaLabel: string
  placeholder: string
  disabled?: boolean
}

/**
 * A calendar-date picker whose value is a plain `YYYY-MM-DD`, never an
 * instant: a repeat rule's dates are local dates in the rule's own timezone,
 * so converting them through the browser's zone would shift them.
 */
export function LocalDatePicker({
  value,
  onChange,
  ariaLabel,
  placeholder,
  disabled,
}: LocalDatePickerProps) {
  const formatter = useFormatter()
  const selected = value ? toPickerDate(value) : undefined
  const shown = value ? formatLocalDate(formatter, value) : placeholder
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={value ? `${ariaLabel}: ${shown}` : ariaLabel}
            className={cn(
              "w-full justify-between ps-3 text-start font-normal sm:w-[200px]",
              !value && "text-muted-foreground",
            )}
            disabled={disabled}
            type="button"
            variant="outline"
          >
            {value ? shown : placeholder}
            <CalendarIcon aria-hidden="true" className="h-4 w-4 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          captionLayout="dropdown"
          mode="single"
          onSelect={(date) => {
            if (date) {
              onChange(toLocalDateString(date))
            }
          }}
          selected={selected}
        />
      </PopoverContent>
    </Popover>
  )
}

type LocalDateFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label: string
  placeholder: string
}

export function LocalDateField<T extends FieldValues>({
  name,
  label,
  placeholder,
}: LocalDateFieldProps<T>) {
  return (
    <FormFieldWrapper label={label} name={name} required>
      {(field) => (
        <LocalDatePicker
          ariaLabel={label}
          onChange={(value) => field.onChange(value as T[FieldPath<T>])}
          placeholder={placeholder}
          value={field.value as string | undefined}
        />
      )}
    </FormFieldWrapper>
  )
}
