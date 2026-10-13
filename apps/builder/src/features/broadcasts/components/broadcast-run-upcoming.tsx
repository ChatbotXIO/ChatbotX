"use client"

import { isRecurringTemplate } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { listUpcomingSlots } from "@chatbotx.io/utils/recurrence"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import {
  formatLocalDate,
  RUN_WHEN_FORMAT,
} from "@/components/recurrence/local-date"
import { setBroadcastRunSkippedAction } from "../actions/set-broadcast-run-skipped.action"
import { useInvalidateBroadcastRuns } from "../hooks/use-invalidate-broadcast-runs"
import type { BroadcastResourceWithRelations } from "../schema/resource"

const UPCOMING_SLOTS_SHOWN = 5

type BroadcastRunUpcomingProps = {
  broadcast: BroadcastResourceWithRelations
  workspaceId: string
}

/**
 * The next runs of a live series, each with a one-click Skip (a holiday, a
 * closure) or Restore. Skipping is reversible until the run starts, so there is
 * no confirmation — the toast offers Undo instead. Paused and finished series
 * have no upcoming runs and render nothing.
 */
export function BroadcastRunUpcoming({
  broadcast,
  workspaceId,
}: BroadcastRunUpcomingProps) {
  const t = useTranslations("broadcasts.runs.upcoming")
  const format = useFormatter()
  const router = useRouter()
  const invalidateRuns = useInvalidateBroadcastRuns()

  const { execute, isPending, input } = useAction(
    setBroadcastRunSkippedAction.bind(null, workspaceId, broadcast.id),
    {
      onSuccess: ({ input }) => {
        const date = formatLocalDate(format, input.date)
        if (input.skipped) {
          toast.success(t("skipped", { date }), {
            action: {
              label: t("undo"),
              onClick: () => execute({ date: input.date, skipped: false }),
            },
          })
        } else {
          toast.success(t("restored", { date }))
        }
        invalidateRuns()
        router.refresh()
      },
      onError: () => {
        toast.error(t("error"))
        // The run may have started or the series changed in another tab.
        router.refresh()
      },
    },
  )

  const recurrence =
    isRecurringTemplate(broadcast) && broadcast.status === "recurring"
      ? broadcast.recurrence
      : null
  if (!recurrence?.nextRunAt || recurrence.pausedAt || recurrence.endedAt) {
    return null
  }

  const { rule } = recurrence
  const slots = listUpcomingSlots(rule, {
    after: new Date(),
    occurrenceCount: recurrence.occurrenceCount,
    limit: UPCOMING_SLOTS_SHOWN,
  })

  return (
    <section
      aria-labelledby="upcoming-runs-heading"
      className="flex flex-col gap-2"
    >
      <h2 className="font-medium text-sm" id="upcoming-runs-heading">
        {t("title")}
      </h2>
      {slots.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {slots.map((slot) => (
            <li
              className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm"
              key={slot.date}
            >
              <bdi
                className={
                  slot.excluded ? "text-muted-foreground line-through" : ""
                }
              >
                {format.dateTime(slot.at, {
                  ...RUN_WHEN_FORMAT,
                  timeZone: rule.timezone,
                })}
              </bdi>
              {slot.excluded && (
                <Badge variant="secondary">{t("skippedBadge")}</Badge>
              )}
              <Button
                className="ms-auto"
                disabled={isPending}
                onClick={() =>
                  execute({ date: slot.date, skipped: !slot.excluded })
                }
                size="sm"
                variant="outline"
              >
                {isPending && input?.date === slot.date && (
                  <Loader2Icon className="animate-spin" />
                )}
                {slot.excluded ? t("restore") : t("skip")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
