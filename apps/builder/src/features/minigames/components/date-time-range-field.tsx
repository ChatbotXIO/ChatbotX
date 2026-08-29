"use client"

import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { ArrowRightIcon } from "lucide-react"

type DateTimeRangeFieldProps = {
  fromName: string
  toName: string
  label?: string
  required?: boolean
}

export function DateTimeRangeField({
  fromName,
  toName,
  label,
  required,
}: DateTimeRangeFieldProps) {
  return (
    <div className="flex w-full flex-col gap-2">
      {label ? <Label>{label}</Label> : null}
      <div className="flex flex-wrap items-center gap-2">
        <DateTimePickerField
          formItemClassName="min-w-52 flex-1"
          name={fromName}
          required={required}
          saveFormat="iso"
        />
        <ArrowRightIcon className="mt-2 size-4 flex-none text-muted-foreground rtl:rotate-180" />
        <DateTimePickerField
          formItemClassName="min-w-52 flex-1"
          name={toName}
          required={required}
          saveFormat="iso"
        />
      </div>
    </div>
  )
}
