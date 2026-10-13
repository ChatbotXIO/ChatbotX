"use client"

import {
  listUpcomingOccurrences,
  RECURRENCE_MONTH_DAY_LAST,
  type RecurrenceRule,
  recurrenceRuleSchema,
} from "@chatbotx.io/utils/recurrence"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import { formatLocalDate, RUN_WHEN_FORMAT } from "./local-date"
import { todayIn } from "./recurrence-defaults"
import { buildWeekdayOptions } from "./weekday-options"

const UPCOMING_RUNS_SHOWN = 3
const SKIPPED_DATES_SHOWN = 3

/**
 * The rule in words plus its next runs. The runs come from the same function
 * the server uses (`listUpcomingOccurrences`), so what the form promises is
 * what the schedule does. Renders nothing while the rule is incomplete.
 */
export function RecurrenceSummary({
  rule,
  occurrenceCount = 0,
  showUpcoming = true,
}: {
  rule: RecurrenceRule
  /** Runs the series already made; the server counts `afterOccurrences` from it. */
  occurrenceCount?: number
  /** False for a paused or ended series, which has no upcoming runs to promise. */
  showUpcoming?: boolean
}) {
  const t = useTranslations("recurrence")
  const locale = useLocale()
  const formatter = useFormatter()
  const parsed = recurrenceRuleSchema.safeParse(rule)
  if (!parsed.success) {
    return null
  }
  const valid = parsed.data
  const now = new Date()
  const upcoming = showUpcoming
    ? listUpcomingOccurrences(valid, {
        after: now,
        occurrenceCount,
        limit: UPCOMING_RUNS_SHOWN,
      })
    : []
  const whenFormat = {
    ...RUN_WHEN_FORMAT,
    timeZone: valid.timezone,
    timeZoneName: "short",
  } as const

  const weekdayNames = new Map(
    buildWeekdayOptions(locale).map((option) => [
      option.value,
      option.ariaLabel,
    ]),
  )
  const sentence = t("summary.sentence", {
    frequency: valid.frequency,
    interval: valid.interval,
    weekdays: formatter.list(
      (valid.weekdays ?? []).map((day) => weekdayNames.get(day) ?? ""),
      { type: "conjunction" },
    ),
    monthDay:
      valid.monthDay === RECURRENCE_MONTH_DAY_LAST
        ? "last"
        : String(valid.monthDay ?? ""),
    time: valid.timeOfDay,
    timezone: valid.timezone,
    startsOn: formatLocalDate(formatter, valid.startsOn),
    endKind: valid.end.kind,
    endDate:
      valid.end.kind === "onDate"
        ? formatLocalDate(formatter, valid.end.date)
        : "",
    endCount: valid.end.kind === "afterOccurrences" ? valid.end.count : 0,
  })

  const skippedDates = valid.excludeDates ?? []

  const [first] = upcoming
  // Only a series that has not run yet can have a "first run" to warn about.
  const startsToday =
    occurrenceCount === 0 && valid.startsOn === todayIn(valid.timezone, now)
  const firstRunIsLater =
    startsToday && first && todayIn(valid.timezone, first) !== valid.startsOn

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm">
      {/* Announced as the user edits the rule. */}
      <p aria-live="polite">{sentence}</p>
      {skippedDates.length > 0 && (
        <p className="text-muted-foreground">
          {t("skipping", {
            dates: formatter.list(
              skippedDates
                .slice(0, SKIPPED_DATES_SHOWN)
                .map((date) => formatLocalDate(formatter, date)),
              { type: "conjunction" },
            ),
            more: Math.max(0, skippedDates.length - SKIPPED_DATES_SHOWN),
          })}
        </p>
      )}
      {firstRunIsLater && (
        <p className="text-amber-700 dark:text-amber-400" role="status">
          {t("firstRunLater", {
            when: formatter.dateTime(first, whenFormat),
          })}
        </p>
      )}
      {upcoming.length > 0 ? (
        <div>
          <p className="font-medium">{t("nextRuns")}</p>
          <ul className="list-disc ps-5 text-muted-foreground">
            {upcoming.map((run) => (
              <li key={run.toISOString()}>
                <bdi>{formatter.dateTime(run, whenFormat)}</bdi>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        showUpcoming && (
          <p className="text-muted-foreground">{t("noUpcomingRuns")}</p>
        )
      )}
    </div>
  )
}
