import { format, parse } from "date-fns"
import type { FieldPath, FieldValues } from "react-hook-form"
import { DateTimePicker, type DateTimePickerProps } from "../ui/date-picker"
import { FormFieldWrapper } from "./field-wrapper"

type DateTimePickerFieldProps<T extends FieldValues> = DateTimePickerProps & {
  name: FieldPath<T>
  label?: string
  required?: boolean
  description?: string
  descriptionType?: "inline" | "tooltip"
  formItemClassName?: string
  dateTimeFormat?: string
  saveFormat?: "formatted" | "iso"
}

export function DatePickerField<T extends FieldValues>(
  props: Omit<
    DateTimePickerFieldProps<T>,
    "locale" | "weekStartsOn" | "showWeekNumber" | "showOutsideDays"
  >,
) {
  const {
    label,
    name,
    required,
    description,
    descriptionType = "inline",
    formItemClassName,
    dateTimeFormat = "yyyy-MM-dd",
    ...rest
  } = props

  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      formItemClassName={formItemClassName}
      label={label}
      name={name}
      required={required}
    >
      {(field) => {
        const getDateValue = (): Date | undefined => {
          if (!field.value) {
            return
          }
          try {
            return parse(field.value as string, dateTimeFormat, new Date())
          } catch {
            return
          }
        }

        const handleChange = (value: Date | undefined) => {
          field.onChange(
            (value
              ? format(value, dateTimeFormat)
              : undefined) as T[FieldPath<T>],
          )
        }

        return (
          <DateTimePicker
            displayFormat={{ hour24: dateTimeFormat }}
            granularity="day"
            {...rest}
            onChange={handleChange}
            value={getDateValue()}
          />
        )
      }}
    </FormFieldWrapper>
  )
}

export function DateTimePickerField<T extends FieldValues>(
  props: Omit<
    DateTimePickerFieldProps<T>,
    "locale" | "weekStartsOn" | "showWeekNumber" | "showOutsideDays"
  >,
) {
  const {
    label,
    name,
    required,
    description,
    descriptionType = "inline",
    formItemClassName,
    dateTimeFormat = "yyyy-MM-dd HH:mm:ss",
    saveFormat = "formatted",
    ...rest
  } = props

  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      formItemClassName={formItemClassName}
      label={label}
      name={name}
      required={required}
    >
      {(field) => {
        const getDateValue = (): Date | undefined => {
          if (!field.value) {
            return
          }
          try {
            if (saveFormat === "iso") {
              const parsed = new Date(field.value as string)
              return Number.isNaN(parsed.getTime()) ? undefined : parsed
            }
            return parse(field.value as string, dateTimeFormat, new Date())
          } catch {
            return
          }
        }

        const handleChange = (value: Date | undefined) => {
          if (!value) {
            field.onChange(undefined as T[FieldPath<T>])
            return
          }
          const saved =
            saveFormat === "iso"
              ? value.toISOString()
              : format(value, dateTimeFormat)
          field.onChange(saved as T[FieldPath<T>])
        }

        return (
          <DateTimePicker
            displayFormat={{ hour24: dateTimeFormat }}
            {...rest}
            onChange={handleChange}
            value={getDateValue()}
          />
        )
      }}
    </FormFieldWrapper>
  )
}
