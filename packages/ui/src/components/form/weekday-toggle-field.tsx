import type { FieldPath, FieldValues } from "react-hook-form"
import { cn } from "../../lib/utils"
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group"
import { FormFieldWrapper } from "./field-wrapper"

export type WeekdayToggleOption = {
  /** 0 = Sunday … 6 = Saturday (the JS `getDay` numbering). */
  value: number
  /** Short visible text, e.g. "Mon". */
  label: string
  /** Full name for assistive tech, e.g. "Monday". */
  ariaLabel: string
}

type WeekdayToggleFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  required?: boolean
  description?: string
  descriptionType?: "inline" | "tooltip"
  /** Already ordered for display (the caller decides the first day of the week). */
  options: readonly WeekdayToggleOption[]
  className?: string
}

/**
 * A row of day-of-week toggles bound to a `number[]` field. Each toggle is a
 * real button with `aria-pressed` (the toggle primitive's contract) and the
 * full day name as its accessible name, so the row reads as a group of days
 * rather than a row of single letters.
 */
export function WeekdayToggleField<T extends FieldValues>({
  name,
  label,
  required,
  description,
  descriptionType = "inline",
  options,
  className,
}: WeekdayToggleFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      label={label}
      name={name}
      required={required}
    >
      {(field) => {
        const selected = Array.isArray(field.value)
          ? (field.value as number[]).map(String)
          : []
        return (
          <ToggleGroup
            aria-label={label}
            className={cn("flex w-full flex-wrap gap-1", className)}
            multiple
            onValueChange={(values) =>
              field.onChange(
                values.map(Number).sort((a, b) => a - b) as T[FieldPath<T>],
              )
            }
            value={selected}
            variant="outline"
          >
            {options.map((option) => (
              <ToggleGroupItem
                aria-label={option.ariaLabel}
                className={cn(
                  "min-w-10 rounded-md",
                  // The default pressed tint is the hover tint; a selected day
                  // must read as selected at a glance, in light and dark.
                  "data-pressed:border-primary data-pressed:bg-primary data-pressed:font-semibold data-pressed:text-primary-foreground",
                  "data-pressed:hover:bg-primary/90 data-pressed:hover:text-primary-foreground",
                )}
                key={option.value}
                value={String(option.value)}
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )
      }}
    </FormFieldWrapper>
  )
}
