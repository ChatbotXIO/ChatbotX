"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Calendar } from "@chatbotx.io/ui/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  findSlotOnDate,
  RECURRENCE_MAX_EXCLUDED_DATES,
  type RecurrenceRule,
  recurrenceRuleSchema,
} from "@chatbotx.io/utils/recurrence"
import { CalendarPlusIcon, XIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { formatLocalDate, toLocalDateString, toPickerDate } from "./local-date"
import { todayIn } from "./recurrence-defaults"

/** Chips shown before the rest collapse behind "Show all". */
const COLLAPSED_CHIP_COUNT = 8

type ExcludeDatesPickerProps = {
  value: string[]
  onChange: (value: string[]) => void
  rule: RecurrenceRule
  occurrenceCount: number
}

function ExcludeDatesPicker({
  value,
  onChange,
  rule,
  occurrenceCount,
}: ExcludeDatesPickerProps) {
  const t = useTranslations("recurrence.excludeDates")
  const formatter = useFormatter()
  const [expanded, setExpanded] = useState(false)

  // A half-edited rule has no runs to skip, so the picker simply stays closed.
  const validRule = useMemo(() => {
    const parsed = recurrenceRuleSchema.safeParse(rule)
    return parsed.success ? parsed.data : null
  }, [rule])
  const today = validRule ? todayIn(validRule.timezone, new Date()) : null
  const selected = useMemo(() => new Set(value), [value])

  // Only days the schedule really runs on (and that are still ahead) can be
  // picked; a day that is already skipped stays clickable so it can be undone.
  const isPickable = (date: Date): boolean => {
    const localDate = toLocalDateString(date)
    if (selected.has(localDate)) {
      return true
    }
    return Boolean(
      validRule &&
        today &&
        localDate >= today &&
        findSlotOnDate(validRule, { date: localDate, occurrenceCount }),
    )
  }

  const visible = expanded ? value : value.slice(0, COLLAPSED_CHIP_COUNT)
  const hiddenCount = value.length - visible.length
  const remove = (date: string) =>
    onChange(value.filter((existing) => existing !== date))

  return (
    <div className="flex flex-col gap-2">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              className="w-fit"
              disabled={!validRule}
              size="sm"
              type="button"
              variant="outline"
            >
              <CalendarPlusIcon aria-hidden="true" />
              {t("add")}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            defaultMonth={toPickerDate(
              today && today > rule.startsOn ? today : rule.startsOn,
            )}
            disabled={(date) => !isPickable(date)}
            max={RECURRENCE_MAX_EXCLUDED_DATES}
            mode="multiple"
            onSelect={(dates) =>
              onChange((dates ?? []).map(toLocalDateString).sort())
            }
            selected={value.map(toPickerDate)}
          />
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5">
          {visible.map((date) => {
            const label = formatLocalDate(formatter, date)
            return (
              <li key={date}>
                <Badge className="gap-1 ps-2 pe-1" variant="outline">
                  <bdi>{label}</bdi>
                  <button
                    aria-label={t("remove", { date: label })}
                    className="rounded-sm p-0.5 hover:bg-accent"
                    onClick={() => remove(date)}
                    type="button"
                  >
                    <XIcon aria-hidden="true" />
                  </button>
                </Badge>
              </li>
            )
          })}
          {value.length > COLLAPSED_CHIP_COUNT && (
            <li>
              <Button
                className="h-auto p-0 text-xs"
                onClick={() => setExpanded((open) => !open)}
                type="button"
                variant="link"
              >
                {expanded
                  ? t("showLess")
                  : t("showAll", { count: hiddenCount })}
              </Button>
            </li>
          )}
          {value.length > 1 && (
            <li>
              <Button
                className="h-auto p-0 text-muted-foreground text-xs"
                onClick={() => onChange([])}
                type="button"
                variant="link"
              >
                {t("clearAll")}
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

type ExcludeDatesFieldProps = {
  namePrefix: string
  rule: RecurrenceRule
  occurrenceCount: number
}

/** "Skip dates": local dates, in the rule's zone, on which the series stays silent. */
export function ExcludeDatesField<T extends FieldValues>({
  namePrefix,
  rule,
  occurrenceCount,
}: ExcludeDatesFieldProps) {
  const t = useTranslations("recurrence.excludeDates")
  return (
    <FormFieldWrapper<T>
      description={t("hint")}
      label={t("label")}
      name={`${namePrefix}.excludeDates` as FieldPath<T>}
    >
      {(field) => (
        <ExcludeDatesPicker
          occurrenceCount={occurrenceCount}
          onChange={(value) => field.onChange(value as T[FieldPath<T>])}
          rule={rule}
          value={(field.value as string[] | undefined) ?? []}
        />
      )}
    </FormFieldWrapper>
  )
}
