"use client"

import type { WhatsappCallHours } from "@chatbotx.io/integration-whatsapp/api/calling"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { toast } from "sonner"
import { updateWhatsappCallHoursAction } from "./actions/update-call-hours.action"
import { buildCallHoursFormValues } from "./lib/call-hours"
import {
  CALL_HOURS_TIMEZONE_CODES,
  type CallHoursDay,
  type CallHoursFormValues,
  CallHoursIssue,
  callHoursFormSchema,
  LAST_MINUTE_OF_DAY,
  MAX_CALL_HOURS_RANGES_PER_DAY,
} from "./schemas/call-hours-schema"

const TIME_STEP_MINUTES = 15
const DEFAULT_OPEN_MINUTE = 9 * 60
const DEFAULT_CLOSE_MINUTE = 17 * 60
const MINUTES_PER_HOUR = 60

const TIMEZONE_OPTIONS = CALL_HOURS_TIMEZONE_CODES.map((timezone) => ({
  value: timezone,
  label: timezone,
}))

/** Every 15 minutes through the day, then 23:59 as the last closing time. */
const STEPPED_MINUTES = [
  ...Array.from(
    { length: (24 * MINUTES_PER_HOUR) / TIME_STEP_MINUTES },
    (_, index) => index * TIME_STEP_MINUTES,
  ),
  LAST_MINUTE_OF_DAY,
]

const DAY_LABEL_KEY = {
  MONDAY: "whatsapp.calls.hours.days.monday",
  TUESDAY: "whatsapp.calls.hours.days.tuesday",
  WEDNESDAY: "whatsapp.calls.hours.days.wednesday",
  THURSDAY: "whatsapp.calls.hours.days.thursday",
  FRIDAY: "whatsapp.calls.hours.days.friday",
  SATURDAY: "whatsapp.calls.hours.days.saturday",
  SUNDAY: "whatsapp.calls.hours.days.sunday",
} as const satisfies Record<CallHoursDay, string>

const ISSUE_LABEL_KEY = {
  rangeOrder: "whatsapp.calls.hours.errors.rangeOrder",
  rangeOverlap: "whatsapp.calls.hours.errors.rangeOverlap",
  noOpenHours: "whatsapp.calls.hours.errors.noOpenHours",
} as const satisfies Record<CallHoursIssue, string>

const isCallHoursIssue = (message: unknown): message is CallHoursIssue =>
  typeof message === "string" &&
  Object.values<string>(CallHoursIssue).includes(message)

const formatMinute = (minuteOfDay: number): string =>
  `${String(Math.floor(minuteOfDay / MINUTES_PER_HOUR)).padStart(2, "0")}:${String(minuteOfDay % MINUTES_PER_HOUR).padStart(2, "0")}`

/** The stepped times, plus the current one when Meta stored an off-step time. */
const timeOptionsIncluding = (minuteOfDay: number): number[] =>
  STEPPED_MINUTES.includes(minuteOfDay)
    ? STEPPED_MINUTES
    : [...STEPPED_MINUTES, minuteOfDay].sort((a, b) => a - b)

/** A second range starts an hour after the first closes, when the day allows it. */
const nextRange = (
  ranges: CallHoursFormValues["days"][number]["ranges"],
): CallHoursFormValues["days"][number]["ranges"][number] => {
  const last = ranges.at(-1)
  if (!last) {
    return {
      openMinute: DEFAULT_OPEN_MINUTE,
      closeMinute: DEFAULT_CLOSE_MINUTE,
    }
  }
  const openMinute = Math.min(
    last.closeMinute + MINUTES_PER_HOUR,
    LAST_MINUTE_OF_DAY - MINUTES_PER_HOUR,
  )
  return {
    openMinute,
    closeMinute: Math.min(openMinute + MINUTES_PER_HOUR, LAST_MINUTE_OF_DAY),
  }
}

type CallTimeSelectProps = {
  value: number
  label: string
  onChange: (minuteOfDay: number) => void
}

function CallTimeSelect({ value, label, onChange }: CallTimeSelectProps) {
  const options = timeOptionsIncluding(value)
  return (
    <Select
      items={options.map((minute) => ({
        label: formatMinute(minute),
        value: String(minute),
      }))}
      onValueChange={(next) => onChange(Number(next))}
      value={String(value)}
    >
      <SelectTrigger aria-label={label} className="w-24">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-64 min-w-(--anchor-width)">
        {options.map((minute) => (
          <SelectItem key={minute} value={String(minute)}>
            {formatMinute(minute)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type WhatsappCallHoursSectionProps = {
  workspaceId: string
  integrationWhatsappId: string
  callHours: WhatsappCallHours | undefined
  workspaceTimezone: string
  disabled: boolean
}

/**
 * The number's weekly call hours on Meta. Unlike the switches above it, a
 * schedule is edited as a whole and saved explicitly: Meta replaces
 * `call_hours` in one piece, so a save per keystroke would send half-edited
 * schedules.
 */
export function WhatsappCallHoursSection({
  workspaceId,
  integrationWhatsappId,
  callHours,
  workspaceTimezone,
  disabled,
}: WhatsappCallHoursSectionProps) {
  const t = useTranslations()
  const defaultValues = useMemo(
    () => buildCallHoursFormValues(callHours, workspaceTimezone),
    [callHours, workspaceTimezone],
  )

  const { form, handleSubmitWithAction, action } = useHookFormAction(
    updateWhatsappCallHoursAction.bind(
      null,
      workspaceId,
      integrationWhatsappId,
    ),
    zodResolver(callHoursFormSchema),
    {
      actionProps: {
        onSuccess: () => {
          // The saved schedule becomes the new baseline for Cancel.
          form.reset(form.getValues())
          toast.success(t("messages.savedSuccessfully"))
        },
        onError: ({ error }) => {
          toast.error(error.serverError ?? t("messages.unknownError"))
        },
      },
      formProps: { mode: "onChange", defaultValues },
    },
  )

  const enabled = form.watch("enabled")
  const days = form.watch("days")
  const { errors, isDirty } = form.formState

  const issueText = (message: unknown): string | undefined =>
    isCallHoursIssue(message) ? t(ISSUE_LABEL_KEY[message]) : undefined

  const setRanges = (
    dayIndex: number,
    ranges: CallHoursFormValues["days"][number]["ranges"],
  ) => {
    form.setValue(`days.${dayIndex}.ranges`, ranges, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const dayErrorText = (dayIndex: number): string | undefined => {
    const dayErrors = errors.days?.[dayIndex]?.ranges
    return (
      issueText(dayErrors?.root?.message ?? dayErrors?.message) ??
      days[dayIndex]?.ranges
        .map((_, rangeIndex) => issueText(dayErrors?.[rangeIndex]?.message))
        .find(Boolean)
    )
  }

  // With call hours switched off the schedule is hidden but still saved, so a
  // problem in it has to surface below the switch instead.
  const formError =
    issueText(errors.days?.root?.message ?? errors.days?.message) ??
    (enabled ? undefined : days.map((_, i) => dayErrorText(i)).find(Boolean))

  return (
    <Form {...form}>
      <form
        aria-labelledby="whatsapp-call-hours-title"
        className="flex flex-col gap-4 border-t pt-5"
        onSubmit={handleSubmitWithAction}
      >
        <fieldset
          className="flex flex-col gap-4"
          disabled={disabled || action.isPending}
        >
          <div className="flex flex-col gap-0.5">
            <h3 className="font-medium text-sm" id="whatsapp-call-hours-title">
              {t("whatsapp.calls.hours.title")}
            </h3>
            <p className="text-muted-foreground text-xs">
              {t("whatsapp.calls.hours.description")}
            </p>
          </div>

          <SwitchField
            label={t("whatsapp.calls.hours.enabledLabel")}
            name="enabled"
          />

          {enabled && (
            <>
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("whatsapp.calls.hours.timezoneLabel")}
                name="timezoneId"
                options={TIMEZONE_OPTIONS}
                placeholder={t("actions.pleaseSelect")}
              />

              <ul className="flex flex-col divide-y rounded-md border">
                {days.map((day, dayIndex) => {
                  const dayLabel = t(DAY_LABEL_KEY[day.dayOfWeek])
                  const dayError = dayErrorText(dayIndex)
                  return (
                    <li
                      className="flex flex-wrap items-start gap-3 px-3 py-2"
                      key={day.dayOfWeek}
                    >
                      <span className="w-24 pt-2 font-medium text-sm">
                        {dayLabel}
                      </span>
                      <div className="flex flex-1 flex-col gap-2">
                        {day.ranges.length === 0 && (
                          <span className="pt-2 text-muted-foreground text-sm">
                            {t("whatsapp.calls.hours.closed")}
                          </span>
                        )}
                        {day.ranges.map((range, rangeIndex) => (
                          <div
                            className="flex items-center gap-2"
                            // biome-ignore lint/suspicious/noArrayIndexKey: ranges have no stable id and at most two per day
                            key={rangeIndex}
                          >
                            <CallTimeSelect
                              label={t("whatsapp.calls.hours.openTimeLabel", {
                                day: dayLabel,
                              })}
                              onChange={(openMinute) =>
                                setRanges(
                                  dayIndex,
                                  day.ranges.map((r, i) =>
                                    i === rangeIndex ? { ...r, openMinute } : r,
                                  ),
                                )
                              }
                              value={range.openMinute}
                            />
                            <span aria-hidden="true">–</span>
                            <CallTimeSelect
                              label={t("whatsapp.calls.hours.closeTimeLabel", {
                                day: dayLabel,
                              })}
                              onChange={(closeMinute) =>
                                setRanges(
                                  dayIndex,
                                  day.ranges.map((r, i) =>
                                    i === rangeIndex
                                      ? { ...r, closeMinute }
                                      : r,
                                  ),
                                )
                              }
                              value={range.closeMinute}
                            />
                            <Button
                              aria-label={t(
                                "whatsapp.calls.hours.removeRangeLabel",
                                { day: dayLabel },
                              )}
                              onClick={() =>
                                setRanges(
                                  dayIndex,
                                  day.ranges.filter((_, i) => i !== rangeIndex),
                                )
                              }
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <TrashIcon className="size-4" />
                            </Button>
                          </div>
                        ))}
                        {dayError && (
                          <p className="text-destructive text-xs" role="alert">
                            {dayError}
                          </p>
                        )}
                      </div>
                      {day.ranges.length < MAX_CALL_HOURS_RANGES_PER_DAY && (
                        <Button
                          aria-label={t("whatsapp.calls.hours.addRangeLabel", {
                            day: dayLabel,
                          })}
                          onClick={() =>
                            setRanges(dayIndex, [
                              ...day.ranges,
                              nextRange(day.ranges),
                            ])
                          }
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <PlusIcon className="size-4" />
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="text-muted-foreground text-xs">
                {t("whatsapp.calls.hours.overnightHint")}
              </p>
            </>
          )}

          {formError && (
            <p className="text-destructive text-sm" role="alert">
              {formError}
            </p>
          )}

          {isDirty && (
            <div className="flex gap-2">
              <Button disabled={action.isPending} type="submit">
                {action.isPending && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {t("actions.save")}
              </Button>
              <Button
                onClick={() => form.reset()}
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
            </div>
          )}
        </fieldset>
      </form>
    </Form>
  )
}
