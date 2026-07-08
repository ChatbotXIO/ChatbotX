import { cn } from "@chatbotx.io/ui/lib/utils"
import { format, parse } from "date-fns"
import { ClockIcon } from "lucide-react"
import { useRef } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { TimePickerInput } from "../ui/date-picker"
import { FormFieldWrapper } from "./field-wrapper"

const TIME_INPUT_CLASSNAME =
  "h-auto w-6 border-0 p-0 text-center font-mono text-sm shadow-none focus-visible:bg-accent focus-visible:ring-0"

function TimeInputGroup({
  date,
  onChange,
}: {
  date: Date | undefined
  onChange: (date: Date | undefined) => void
}) {
  const hourRef = useRef<HTMLInputElement>(null)
  const minuteRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={cn(
        "flex h-9 w-full items-center gap-1.5 rounded-md border border-input bg-transparent px-3 shadow-xs transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
      )}
    >
      <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
      <TimePickerInput
        className={TIME_INPUT_CLASSNAME}
        date={date}
        onDateChange={onChange}
        onRightFocus={() => minuteRef.current?.focus()}
        picker="hours"
        ref={hourRef}
      />
      <span className="text-muted-foreground">:</span>
      <TimePickerInput
        className={TIME_INPUT_CLASSNAME}
        date={date}
        onDateChange={onChange}
        onLeftFocus={() => hourRef.current?.focus()}
        picker="minutes"
        ref={minuteRef}
      />
    </div>
  )
}

type TimeFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  required?: boolean
  description?: string
  descriptionType?: "inline" | "tooltip"
  formItemClassName?: string
}

export function TimeField<T extends FieldValues>(props: TimeFieldProps<T>) {
  const {
    name,
    label,
    required,
    description,
    descriptionType,
    formItemClassName,
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
            return parse(field.value as string, "HH:mm", new Date())
          } catch {
            return
          }
        }

        const handleChange = (value: Date | undefined) => {
          field.onChange(
            (value ? format(value, "HH:mm") : undefined) as T[FieldPath<T>],
          )
        }

        return <TimeInputGroup date={getDateValue()} onChange={handleChange} />
      }}
    </FormFieldWrapper>
  )
}
