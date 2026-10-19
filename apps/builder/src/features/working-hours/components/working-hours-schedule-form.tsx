"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { ClockIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { buildWeekdayOptions } from "@/components/recurrence/weekday-options"
import { updateWorkingHoursAction } from "../actions/update-working-hours.action"
import { workingHoursListHref } from "../lib/routes"
import {
  addInterval,
  DISPLAY_WEEKDAYS,
  intervalsOfWeekday,
  removeIntervalAt,
  type ScheduleInterval,
  setIntervalBoundary,
  sortIntervals,
  toggleWeekday,
  validateSchedule,
} from "../lib/schedule-state"
import { updateWorkingHoursRequest } from "../schema/action"
import type { WorkingHoursResource } from "../schema/resource"
import { WorkingHoursDayRow } from "./working-hours-day-row"

export function WorkingHoursScheduleForm({
  workspaceId,
  workingHours,
  timezone,
}: {
  workspaceId: string
  workingHours: WorkingHoursResource
  timezone: string
}) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const listHref = workingHoursListHref(workspaceId)

  const { form, action } = useHookFormAction(
    updateWorkingHoursAction.bind(null, workspaceId, workingHours.id),
    zodResolver(updateWorkingHoursRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", { feature: t("workingHours.label") }),
          )
          router.push(listHref)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        defaultValues: { intervals: workingHours.intervals },
      },
      errorMapProps: {},
    },
  )

  const watched = useWatch({ control: form.control, name: "intervals" })
  const intervals: ScheduleInterval[] = watched ?? []
  const errors = useMemo(() => validateSchedule(intervals), [intervals])
  const dayLabels = useMemo(
    () =>
      new Map(
        buildWeekdayOptions(locale).map((option) => [
          option.value,
          option.ariaLabel ?? option.label,
        ]),
      ),
    [locale],
  )

  const setIntervals = (next: ScheduleInterval[]) =>
    form.setValue("intervals", next, { shouldDirty: true })

  const isPending = action.isPending
  const hasErrors = errors.size > 0

  const onSubmit = form.handleSubmit((values) => {
    action.execute({ intervals: sortIntervals(values.intervals ?? []) })
  })

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <div className="sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap items-center justify-between gap-3 bg-background px-1 py-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="truncate font-bold text-xl leading-tight">
              {workingHours.name}
            </h1>
            <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <ClockIcon className="size-3.5" />
              {t("workingHours.editor.timezoneNote", { timezone })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              nativeButton={false}
              render={<Link href={listHref} />}
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={hasErrors || isPending} type="submit">
              {isPending && <Loader2Icon className="animate-spin" />}
              {t("actions.save")}
            </Button>
          </div>
        </div>

        <div className="rounded-md border px-4">
          {DISPLAY_WEEKDAYS.map((weekday) => (
            <WorkingHoursDayRow
              dayLabel={dayLabels.get(weekday) ?? String(weekday)}
              disabled={isPending}
              error={errors.get(weekday)}
              key={weekday}
              onAdd={() => setIntervals(addInterval(intervals, weekday))}
              onChange={(index, boundary, minute) =>
                setIntervals(
                  setIntervalBoundary(intervals, index, boundary, minute),
                )
              }
              onRemove={(index) =>
                setIntervals(removeIntervalAt(intervals, index))
              }
              onToggle={(enabled) =>
                setIntervals(toggleWeekday(intervals, weekday, enabled))
              }
              rows={intervalsOfWeekday(intervals, weekday)}
              weekday={weekday}
            />
          ))}
        </div>
      </form>
    </Form>
  )
}
