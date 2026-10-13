"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TimeField } from "@chatbotx.io/ui/components/form/time-field"
import { WeekdayToggleField } from "@chatbotx.io/ui/components/form/weekday-toggle-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  RECURRENCE_MAX_INTERVAL,
  RECURRENCE_MONTH_DAY_LAST,
  type RecurrenceFrequency,
  type RecurrenceRule,
  recurrenceFrequencies,
} from "@chatbotx.io/utils/recurrence"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useRef } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { allTimezoneOptions } from "@/features/workspaces/schema/types"
import { LocalDateField } from "./local-date-picker"
import { applyFrequency } from "./recurrence-defaults"
import { RecurrenceEndField } from "./recurrence-end-field"
import { RecurrenceSummary } from "./recurrence-summary"
import { buildWeekdayOptions } from "./weekday-options"

const DAYS_IN_MONTH = 31
const MONTH_DAYS = Array.from(
  { length: DAYS_IN_MONTH },
  (_, index) => index + 1,
)
const FIRST_MONTH_DAY_THAT_CLAMPS = 29

/**
 * The repeat editor: "Repeat every N day|week|month", the weekdays or the
 * day of the month, the time and timezone, the start, the end, and a live
 * summary with the next runs. It edits the `recurrence` object of the
 * surrounding form (one rule shape, shared with the server).
 */
export function RecurrenceRuleFields({
  namePrefix = "recurrence",
  occurrenceCount = 0,
}: {
  namePrefix?: string
  /** Runs the series being edited already made, so the preview counts like the server. */
  occurrenceCount?: number
}) {
  const t = useTranslations("recurrence")
  const locale = useLocale()
  const { setValue, control } = useFormContext()
  const rule = useWatch({ control, name: namePrefix }) as
    | RecurrenceRule
    | undefined
  // The weekdays picked before switching to daily/monthly come back on the way back.
  const rememberedWeekdays = useRef<number[] | undefined>(undefined)

  const weekdayOptions = useMemo(() => buildWeekdayOptions(locale), [locale])
  // A zone the browser reports under another alias (e.g. `Asia/Saigon`) is a
  // valid rule zone that the picker list may not name; keep it selectable.
  const currentTimezone = rule?.timezone
  const timezoneOptions = useMemo(
    () =>
      !currentTimezone ||
      allTimezoneOptions.some((option) => option.value === currentTimezone)
        ? allTimezoneOptions
        : [
            { value: currentTimezone, label: currentTimezone },
            ...allTimezoneOptions,
          ],
    [currentTimezone],
  )
  const monthDayOptions = useMemo(
    () => [
      ...MONTH_DAYS.map((day) => ({
        value: String(day),
        label: t("monthDay.day", { day }),
      })),
      { value: RECURRENCE_MONTH_DAY_LAST, label: t("monthDay.last") },
    ],
    [t],
  )

  if (!rule) {
    return null
  }

  const frequencyOptions = recurrenceFrequencies.options.map((value) => ({
    value,
    label: t("unit", { frequency: value, count: rule.interval }),
  }))
  const changeFrequency = (value?: string) => {
    if (!value) {
      return
    }
    if (rule.frequency === "weekly") {
      rememberedWeekdays.current = rule.weekdays
    }
    setValue(
      namePrefix,
      applyFrequency(
        rule,
        value as RecurrenceFrequency,
        rememberedWeekdays.current,
      ),
      { shouldValidate: true, shouldDirty: true },
    )
  }
  const clampsInShortMonths =
    typeof rule.monthDay === "number" &&
    rule.monthDay >= FIRST_MONTH_DAY_THAT_CLAMPS

  return (
    <fieldset className="flex flex-col gap-4 rounded-md border p-4">
      <legend className="px-1 font-medium text-sm">{t("title")}</legend>

      <fieldset
        aria-label={t("every")}
        className="m-0 flex min-w-0 flex-wrap items-start gap-2 border-0 p-0"
      >
        <InputNumberField
          className="w-20"
          formItemClassName="w-auto"
          inputMode="numeric"
          label={t("every")}
          max={RECURRENCE_MAX_INTERVAL[rule.frequency]}
          min={1}
          name={`${namePrefix}.interval`}
          required
        />
        <SelectField
          formItemClassName="w-auto min-w-36 self-end"
          name={`${namePrefix}.frequency`}
          options={frequencyOptions}
          triggerValueChange={changeFrequency}
        />
      </fieldset>

      {rule.frequency === "weekly" && (
        <WeekdayToggleField
          label={t("weekdays")}
          name={`${namePrefix}.weekdays`}
          options={weekdayOptions}
          required
        />
      )}

      {rule.frequency === "monthly" && (
        <FormFieldWrapper
          description={clampsInShortMonths ? t("monthDay.hint") : undefined}
          label={t("monthDay.label")}
          name={`${namePrefix}.monthDay`}
          required
        >
          {(field) => (
            <Select
              items={monthDayOptions}
              onValueChange={(value) =>
                field.onChange(
                  (value === RECURRENCE_MONTH_DAY_LAST
                    ? value
                    : Number(value)) as never,
                )
              }
              value={String(field.value ?? "")}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthDayOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormFieldWrapper>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TimeField
          label={t("time")}
          name={`${namePrefix}.timeOfDay`}
          required
        />
        <ComboboxField
          emptyText={t("noTimezone")}
          label={t("timezone")}
          name={`${namePrefix}.timezone`}
          options={timezoneOptions}
          required
          searchPlaceholder={t("searchTimezone")}
        />
      </div>

      <LocalDateField
        label={t("startsOn")}
        name={`${namePrefix}.startsOn`}
        placeholder={t("end.pickDate")}
      />

      <RecurrenceEndField namePrefix={namePrefix} startsOn={rule.startsOn} />

      <RecurrenceSummary occurrenceCount={occurrenceCount} rule={rule} />
    </fieldset>
  )
}
