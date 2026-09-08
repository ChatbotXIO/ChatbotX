import type { ReactNode } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { Controller } from "react-hook-form"
import { cn } from "../../lib/utils"
import { Checkbox } from "../ui/checkbox"
import { FormFieldWrapper } from "./field-wrapper"

export type CheckboxGroupOption = {
  value: string
  label: string
  description?: string
  disabled?: boolean
  /** Rendered before the label (e.g. an avatar or a channel icon). */
  leading?: ReactNode
  /**
   * Rendered at the very end of the row (e.g. a per-row Switch). Deliberately
   * outside the `<label>`, so clicking it never toggles the checkbox.
   */
  trailing?: ReactNode
}

type CheckboxGroupFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  required?: boolean
  description?: string
  descriptionType?: "inline" | "tooltip"
  options: CheckboxGroupOption[]
}

/**
 * The text column of one row.
 *
 * Base UI renders the checkbox as a `<span role="checkbox">`, which no
 * `<label for>` can activate — so this column toggles the row itself and is
 * linked back for assistive tech through `aria-labelledby` on the checkbox.
 */
function CheckboxRowLabel({
  option,
  labelId,
  onToggle,
}: {
  option: CheckboxGroupOption
  labelId: string
  onToggle: () => void
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard access lives on the checkbox this column labels (aria-labelledby); the column is a pointer-only click target.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — the checkbox owns focus and key handling.
    // biome-ignore lint/a11y/useKeyWithClickEvents: same — the checkbox owns focus and key handling.
    <div
      className={cn(
        "flex min-w-0 flex-1 select-none flex-col gap-0.5",
        option.disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
      onClick={onToggle}
    >
      {/* Truncated text needs a `title`: the row clips horizontally, so this
          is the only way back to the full name. */}
      <span
        className={cn(
          "truncate font-normal text-sm leading-none",
          option.disabled && "text-muted-foreground",
        )}
        id={labelId}
        title={option.label}
      >
        {option.label}
      </span>
      {option.description && (
        <p
          className="truncate text-muted-foreground text-xs"
          data-slot="checkbox-group-description"
          data-value={option.value}
          title={option.description}
        >
          {option.description}
        </p>
      )}
    </div>
  )
}

/** One checkbox + its label column + the optional trailing slot. */
function CheckboxGroupRow({
  option,
  fieldName,
  isChecked,
  onCheckedChange,
}: {
  option: CheckboxGroupOption
  fieldName: string
  isChecked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const checkboxId = `${fieldName}-${option.value}`
  const labelId = `${checkboxId}-label`

  return (
    <div className="flex items-center space-x-2 pb-2">
      <Checkbox
        aria-labelledby={labelId}
        checked={isChecked}
        className="shrink-0"
        disabled={option.disabled}
        id={checkboxId}
        onCheckedChange={onCheckedChange}
      />
      {option.leading}
      <CheckboxRowLabel
        labelId={labelId}
        onToggle={() => {
          if (!option.disabled) {
            onCheckedChange(!isChecked)
          }
        }}
        option={option}
      />
      {option.trailing && (
        <div className="ms-auto shrink-0">{option.trailing}</div>
      )}
    </div>
  )
}

export function CheckboxGroupField<T extends FieldValues>({
  name,
  label,
  required,
  description,
  descriptionType = "inline",
  options,
}: CheckboxGroupFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      label={label}
      name={name}
      required={required}
    >
      {() => (
        <Controller
          name={name}
          render={({ field }) => {
            const valueArray = Array.isArray(field.value)
              ? (field.value as string[])
              : []

            return (
              // The row's trailing slot (e.g. a switch) must never push the
              // label out of the container — the label column shrinks and
              // truncates instead, and nothing scrolls sideways.
              <div className="space-y-2 overflow-x-hidden">
                {options.map((option) => (
                  <CheckboxGroupRow
                    fieldName={name}
                    isChecked={valueArray.includes(option.value)}
                    key={option.value}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked
                          ? [...valueArray, option.value]
                          : valueArray.filter((v) => v !== option.value),
                      )
                    }
                    option={option}
                  />
                ))}
              </div>
            )
          }}
        />
      )}
    </FormFieldWrapper>
  )
}
