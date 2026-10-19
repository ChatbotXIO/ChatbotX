"use client"

import { WORKING_HOURS_MAX_DATE_OVERRIDES } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { ClockIcon, Loader2Icon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { buildWeekdayOptions } from "@/components/recurrence/weekday-options"
import { updateWorkingHoursAction } from "../actions/update-working-hours.action"
import {
  type DateOverrideDraft,
  sortByDate,
  toDateOverrideDraft,
} from "../lib/date-override-state"
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
import { useInvalidateWorkingHoursOptions } from "../provider/working-hours-hook"
import { updateWorkingHoursRequest } from "../schema/action"
import type {
  WorkingHoursDateOverrideResource,
  WorkingHoursResource,
} from "../schema/resource"
import { DateOverrideDialog } from "./date-override-dialog"
import { DateOverrideTable } from "./date-override-table"
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
  const invalidateOptions = useInvalidateWorkingHoursOptions()
  const listHref = workingHoursListHref(workspaceId)

  const { form, action } = useHookFormAction(
    updateWorkingHoursAction.bind(null, workspaceId, workingHours.id),
    zodResolver(updateWorkingHoursRequest),
    {
      actionProps: {
        onSuccess: () => {
          invalidateOptions()
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
        defaultValues: {
          intervals: workingHours.intervals,
          dateOverrides: workingHours.dateOverrides ?? [],
        },
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

  const watchedOverrides = useWatch({
    control: form.control,
    name: "dateOverrides",
  })
  const dateOverrides: WorkingHoursDateOverrideResource[] = sortByDate(
    watchedOverrides ?? [],
  ).map((row) => ({
    date: row.date,
    name: row.name ?? null,
    ranges: row.ranges,
  }))
  const [overrideDialog, setOverrideDialog] = useState<
    { mode: "closed" } | { mode: "add" } | { mode: "edit"; date: string }
  >({ mode: "closed" })
  const editingOverride =
    overrideDialog.mode === "edit"
      ? dateOverrides.find((row) => row.date === overrideDialog.date)
      : undefined

  const saveOverride = (draft: DateOverrideDraft) => {
    const next: WorkingHoursDateOverrideResource = {
      date: draft.date,
      name: draft.name.trim() || null,
      ranges: draft.closed ? [] : [...draft.ranges],
    }
    form.setValue(
      "dateOverrides",
      [...dateOverrides.filter((row) => row.date !== next.date), next],
      { shouldDirty: true },
    )
    setOverrideDialog({ mode: "closed" })
  }

  const isPending = action.isPending
  const hasErrors = errors.size > 0

  const onSubmit = form.handleSubmit((values) => {
    action.execute({
      intervals: sortIntervals(values.intervals ?? []),
      dateOverrides: sortByDate(values.dateOverrides ?? []),
    })
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
            <p className="text-muted-foreground text-xs">
              {t("workingHours.editor.routingNote")}
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

        <section className="mt-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold text-lg">
                {t("workingHours.dateOverrides.title")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t("workingHours.dateOverrides.description")}
              </p>
            </div>
            <Button
              disabled={
                isPending ||
                dateOverrides.length >= WORKING_HOURS_MAX_DATE_OVERRIDES
              }
              onClick={() => setOverrideDialog({ mode: "add" })}
              type="button"
              variant="outline"
            >
              <PlusIcon />
              {t("workingHours.dateOverrides.add")}
            </Button>
          </div>
          <DateOverrideTable
            disabled={isPending}
            emptyLabel={t("workingHours.dateOverrides.empty")}
            onDelete={(row) =>
              form.setValue(
                "dateOverrides",
                dateOverrides.filter((current) => current.date !== row.date),
                { shouldDirty: true },
              )
            }
            onEdit={(row) =>
              setOverrideDialog({ mode: "edit", date: row.date })
            }
            rows={dateOverrides}
          />
        </section>

        <DateOverrideDialog
          initial={
            editingOverride ? toDateOverrideDraft(editingOverride) : null
          }
          onOpenChange={(open) =>
            !open && setOverrideDialog({ mode: "closed" })
          }
          onSubmit={saveOverride}
          open={overrideDialog.mode !== "closed"}
          pending={false}
          takenDates={dateOverrides.map((row) => row.date)}
          title={
            editingOverride
              ? t("workingHours.dateDialog.editTitle")
              : t("workingHours.dateDialog.addTitle")
          }
        />
      </form>
    </Form>
  )
}
