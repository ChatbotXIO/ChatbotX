"use client"

import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import { resolveTemporalCustomFieldSaveFormat } from "@chatbotx.io/utils/datetime"
import { useLocale, useTranslations } from "next-intl"
import { useEffect } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { toDateFnsLocale } from "@/lib/date-fns-locale"
import { storedDateToDay } from "../lib/field-date"

const DAY_FORMAT = "yyyy-MM-dd"

type CustomFieldValueInputProps = {
  type: CustomFieldType
  /** react-hook-form field path holding the value as a string. */
  name: string
  required?: boolean
  disabled?: boolean
  id?: string
  ariaLabel?: string
  labelledBy?: string
  /** Text length cap of the caller's contract (none by default). */
  maxLength?: number
}

/**
 * The value editor for one custom field type, bound to the surrounding
 * react-hook-form context. Booleans are stored as "true"/"false", dates as a
 * `yyyy-MM-dd` day and datetimes as a UTC ISO instant.
 */
export function CustomFieldValueInput({
  type,
  name,
  required,
  disabled,
  id,
  ariaLabel,
  labelledBy,
  maxLength,
}: CustomFieldValueInputProps) {
  const t = useTranslations("actions")
  const locale = useLocale()
  const { setValue } = useFormContext()
  const aria = {
    "aria-label": ariaLabel,
    "aria-labelledby": labelledBy,
    disabled,
    id,
  }
  switch (type) {
    case "longText":
      return (
        <TextareaField
          {...aria}
          maxLength={maxLength}
          name={name}
          required={required}
        />
      )
    case "shortText":
      return (
        <InputField
          {...aria}
          maxLength={maxLength}
          name={name}
          required={required}
        />
      )
    case "email":
      return (
        <InputField
          {...aria}
          maxLength={maxLength}
          name={name}
          required={required}
          type="email"
        />
      )
    case "phoneNumber":
      return (
        <InputField
          {...aria}
          maxLength={maxLength}
          name={name}
          required={required}
          type="tel"
        />
      )
    case "number":
      return (
        <InputField {...aria} name={name} required={required} type="number" />
      )
    case "date":
    case "datetime":
      // The shared picker takes no id/aria props, so the fieldset carries the label.
      return (
        <fieldset
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          className="m-0 min-w-0 border-0 p-0"
          id={id}
        >
          <DateTimePickerField
            dateTimeFormat={type === "date" ? DAY_FORMAT : undefined}
            disabled={disabled}
            granularity={type === "date" ? "day" : undefined}
            locale={toDateFnsLocale(locale)}
            name={name}
            required={required}
            saveFormat={resolveTemporalCustomFieldSaveFormat(type)}
          />
          {required ? null : (
            // The picker cannot deselect, so an optional date needs a way back to empty.
            <Button
              className="mt-1 h-7 px-2"
              disabled={disabled}
              onClick={() =>
                setValue(name, "", { shouldDirty: true, shouldValidate: true })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("clear")}
            </Button>
          )}
        </fieldset>
      )
    case "boolean":
      return (
        <FormFieldWrapper name={name}>
          {(field) => (
            <Checkbox
              aria-label={ariaLabel}
              aria-labelledby={labelledBy}
              checked={field.value === "true"}
              disabled={disabled}
              id={id}
              onCheckedChange={(checked) =>
                field.onChange(checked ? "true" : "false")
              }
            />
          )}
        </FormFieldWrapper>
      )
    default:
      return null
  }
}

/** Stored value -> what the form field holds (dates may carry an offset or be UTC instants). */
export const toFormValue = (type: CustomFieldType, value: string): string =>
  type === "date" && value ? storedDateToDay(value) : value

type CustomFieldDraftInputProps = Omit<CustomFieldValueInputProps, "name"> & {
  value: string
  onChange: (value: string) => void
}

/**
 * `CustomFieldValueInput` for callers that hold the value in plain state
 * (popover drafts, filter drafts) instead of a form: it owns a one-field
 * form, mirrors `value` into it and reports edits through `onChange`.
 */
export function CustomFieldDraftInput({
  value,
  onChange,
  ...input
}: CustomFieldDraftInputProps) {
  const formValue = toFormValue(input.type, value)
  const form = useForm<{ value: string }>({
    defaultValues: { value: formValue },
  })

  useEffect(() => {
    if (form.getValues("value") !== formValue) {
      form.setValue("value", formValue)
    }
  }, [form, formValue])

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === "value") {
        onChange(values.value ?? "")
      }
    })
    return () => subscription.unsubscribe()
  }, [form, onChange])

  return (
    <Form {...form}>
      <CustomFieldValueInput {...input} name="value" />
    </Form>
  )
}
