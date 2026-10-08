"use client"

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  useFormField,
} from "@chatbotx.io/ui/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useFormContext } from "react-hook-form"
import { TranslatedFieldMessage } from "./translated-field-message"

type GoogleAdsSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type GoogleAdsSelectFieldProps = {
  name: string
  options: GoogleAdsSelectOption[]
  /** The select has no visible label, so this is its accessible name. */
  ariaLabel: string
  placeholder?: string
  description?: string
  /** Called with the picked value, after the form was updated. */
  onPick?: (value: string) => void
}

type SelectBodyProps = Omit<GoogleAdsSelectFieldProps, "name"> & {
  value: string
  onChange: (value: string) => void
}

const SelectBody = ({
  options,
  ariaLabel,
  placeholder,
  description,
  onPick,
  value,
  onChange,
}: SelectBodyProps) => {
  const { isTouched, isDirty, formDescriptionId, formMessageId, error } =
    useFormField()
  // The flow editor validates every step on open: an untouched empty select
  // must not already be red.
  const isErrorHidden = !(isTouched || isDirty)
  const describedBy =
    [
      description ? formDescriptionId : null,
      error && !isErrorHidden ? formMessageId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <>
      <Select
        items={options}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onChange(next)
            onPick?.(next)
          }
        }}
        value={value}
      >
        <FormControl>
          <SelectTrigger
            aria-describedby={describedBy}
            aria-label={ariaLabel}
            className="w-full"
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              disabled={option.disabled}
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? (
        <FormDescription className="text-xs">{description}</FormDescription>
      ) : null}
      <TranslatedFieldMessage hidden={isErrorHidden} />
    </>
  )
}

/**
 * A label-less select bound to react-hook-form for the step form: the
 * accessible name sits on the trigger (Base UI's Select root drops `aria-*`),
 * an optional one-line description sits under it, and validation messages are
 * i18n keys shown only after the field was touched or changed.
 */
export const GoogleAdsSelectField = ({
  name,
  ...bodyProps
}: GoogleAdsSelectFieldProps) => {
  const { control } = useFormContext()

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="w-full min-w-0">
          <SelectBody
            {...bodyProps}
            onChange={field.onChange}
            value={typeof field.value === "string" ? field.value : ""}
          />
        </FormItem>
      )}
    />
  )
}
