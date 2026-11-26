"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  POSTING_SLOT_MAX_TIMES_PER_DAY,
  type PostingScheduleSlots,
} from "@chatbotx.io/utils/posting-slots"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { orpc } from "@/lib/orpc/query"
import { useSavePostingSchedule } from "../hooks/use-save-posting-schedule"
import { useWeekdayLabels } from "../hooks/use-weekday-labels"
import {
  addSlotTime,
  copyDayTo,
  EDITOR_WEEKDAYS,
  removeSlotTime,
  setDayEnabled,
  slotsKey,
} from "../lib/posting-schedule-draft"
import { PostingDayRow } from "./posting-day-row"

const SkeletonRows = () => (
  <div className="space-y-3">
    {EDITOR_WEEKDAYS.map((weekday) => (
      <Skeleton className="h-10 w-full" key={weekday} />
    ))}
  </div>
)

const ScheduleEditor = ({
  initial,
  onClose,
  readOnly,
  timezone,
  destinationId,
  workspaceId,
}: {
  destinationId: string
  initial: PostingScheduleSlots
  onClose: () => void
  readOnly: boolean
  timezone: string
  workspaceId: string
}) => {
  const t = useTranslations()
  const labelOf = useWeekdayLabels()
  const [draft, setDraft] = useState(initial)
  const save = useSavePostingSchedule(onClose)
  const isDirty = slotsKey(draft) !== slotsKey(initial)
  const disabled = readOnly || save.isPending

  return (
    <>
      <p className="text-muted-foreground text-xs">
        {t("posts.connect.schedule.timezone", { timezone })}
        {" · "}
        {t("posts.connect.schedule.maxTimes", {
          count: POSTING_SLOT_MAX_TIMES_PER_DAY,
        })}
      </p>
      <ul className="max-h-[55vh] divide-y overflow-y-auto">
        {EDITOR_WEEKDAYS.map((weekday) => {
          const day = draft.find((item) => item.weekday === weekday)
          return day ? (
            <PostingDayRow
              day={day}
              dayLabel={labelOf(weekday)}
              disabled={disabled}
              key={weekday}
              labelOf={labelOf}
              onAddTime={(time) =>
                setDraft((current) => addSlotTime(current, weekday, time))
              }
              onCopy={(targets) =>
                setDraft((current) => copyDayTo(current, weekday, targets))
              }
              onEnabledChange={(enabled) =>
                setDraft((current) => setDayEnabled(current, weekday, enabled))
              }
              onRemoveTime={(time) =>
                setDraft((current) => removeSlotTime(current, weekday, time))
              }
            />
          ) : null
        })}
      </ul>
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="ghost">
          {t("actions.cancel")}
        </Button>
        <Button
          disabled={disabled || !isDirty}
          onClick={() =>
            save.mutate({
              id: destinationId,
              slots: draft,
              timezone,
              workspaceId,
            })
          }
          type="button"
        >
          {save.isPending ? <Loader2Icon className="animate-spin" /> : null}
          {t("posts.connect.schedule.save")}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Edits a destination's posting schedule (its queue): weekdays on/off and their `HH:mm` times. */
export const PostingScheduleDialog = ({
  destinationId,
  name,
  onOpenChange,
  open,
  readOnly,
  workspaceId,
}: {
  destinationId: string
  name: string
  onOpenChange: (open: boolean) => void
  open: boolean
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const schedule = useQuery(
    orpc.publishDestinationsAPIs.privateGetPostingScheduleAPI.queryOptions({
      enabled: open,
      input: { id: destinationId, workspaceId },
    }),
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("posts.connect.schedule.title", { name })}
          </DialogTitle>
          <DialogDescription>
            {t("posts.connect.schedule.description")}
          </DialogDescription>
        </DialogHeader>
        {schedule.isError ? (
          <div className="space-y-2" role="alert">
            <p className="text-destructive text-sm">
              {t("messages.errorLoadingData")}
            </p>
            <Button
              onClick={() => schedule.refetch()}
              size="sm"
              variant="outline"
            >
              {t("composer.retry")}
            </Button>
          </div>
        ) : null}
        {schedule.isPending ? <SkeletonRows /> : null}
        {schedule.data ? (
          <ScheduleEditor
            destinationId={destinationId}
            initial={schedule.data.slots}
            key={`${schedule.data.updatedAt?.getTime() ?? 0}`}
            onClose={() => onOpenChange(false)}
            readOnly={readOnly}
            timezone={schedule.data.timezone}
            workspaceId={workspaceId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
