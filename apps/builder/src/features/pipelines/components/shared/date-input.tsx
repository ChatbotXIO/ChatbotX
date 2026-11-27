"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DateTimePicker } from "@chatbotx.io/ui/components/ui/date-picker"
import { XIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toDateFnsLocale } from "@/lib/date-fns-locale"

const DISPLAY_FORMAT = { day: "PP", minute: "PP HH:mm" } as const

type DateInputProps = {
  value: Date | undefined
  onChange: (value: Date | undefined) => void
  /** Accessible name of the picker. */
  label: string
  /** `day` picks a calendar day; `minute` adds a time. */
  granularity: keyof typeof DISPLAY_FORMAT
}

/**
 * The app's date picker for Pipelines: localized calendar and a clear button
 * (the picker cannot deselect).
 */
export function DateInput({
  value,
  onChange,
  label,
  granularity,
}: DateInputProps) {
  const t = useTranslations("pipelines")
  const tRoot = useTranslations()
  const locale = useLocale()
  return (
    // The picker's trigger takes no aria props, so a fieldset names it.
    <fieldset className="flex min-w-0 items-center gap-1">
      <legend className="sr-only">{label}</legend>
      <div className="min-w-0 flex-1">
        <DateTimePicker
          className="h-9"
          displayFormat={{ hour24: DISPLAY_FORMAT[granularity] }}
          granularity={granularity}
          locale={toDateFnsLocale(locale)}
          onChange={onChange}
          placeholder={t("filter.pickDate")}
          value={value}
        />
      </div>
      {value ? (
        <Button
          aria-label={`${tRoot("actions.clear")}: ${label}`}
          className="size-9 shrink-0"
          onClick={() => onChange(undefined)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      ) : null}
    </fieldset>
  )
}
