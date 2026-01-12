import { format, parse } from "date-fns"
import type { FieldPath, FieldValues } from "react-hook-form"
import { DateTimePicker, type DateTimePickerProps } from "../ui/date-picker"
import { FormFieldWrapper } from "./field-wrapper"

type DateTimePickerFieldProps<T extends FieldValues> = DateTimePickerProps & {
  name: FieldPath<T>
  label?: string
  required?: boolean
  description?: string
  formItemClassName?: string
  dateTimeFormat?: string
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
    formItemClassName,
    dateTimeFormat = "yyyy-MM-dd",
    ...rest
  } = props

  return (
    <FormFieldWrapper
      description={description}
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
    formItemClassName,
    dateTimeFormat = "yyyy-MM-dd HH:mm:ss",
    ...rest
  } = props

  return (
    <FormFieldWrapper
      description={description}
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
            {...rest}
            onChange={handleChange}
            value={getDateValue()}
          />
        )
      }}
    </FormFieldWrapper>
  )
}
