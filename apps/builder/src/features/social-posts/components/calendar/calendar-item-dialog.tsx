"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { DateTimePicker } from "@chatbotx.io/ui/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import {
  instantToWallClock,
  wallClockToInstant,
} from "@/components/calendar/calendar-grid"
import { ProviderNetworkIcon } from "@/features/social-accounts/components/provider-avatar"
import { useStatusLabel } from "../../hooks/use-status-label"
import type { CalendarItem, RescheduleChange } from "../../lib/calendar-items"
import { MIN_SCHEDULE_LEAD_MS } from "../../lib/calendar-items"
import { STATUS_TONES } from "../../lib/calendar-tones"
import { PROVIDER_LABELS } from "../../lib/composer-state"

const PICKER_FORMAT = "yyyy-MM-dd HH:mm"

/** What a chip opens: the post's details, a way into the editor, and the keyboard route to moving it. */
export const CalendarItemDialog = ({
  canReschedule,
  item,
  onClose,
  onReschedule,
  timezone,
  workspaceId,
}: {
  /** False for a read-only workspace (moving to drafts stays possible). */
  canReschedule: boolean
  item: CalendarItem | null
  onClose: () => void
  onReschedule: (change: RescheduleChange) => void
  timezone: string
  workspaceId: string
}) => (
  <Dialog
    onOpenChange={(open) => {
      if (!open) {
        onClose()
      }
    }}
    open={item !== null}
  >
    {item ? (
      <ItemDetails
        canReschedule={canReschedule}
        item={item}
        key={`${item.postId}:${item.targetId}`}
        onClose={onClose}
        onReschedule={onReschedule}
        timezone={timezone}
        workspaceId={workspaceId}
      />
    ) : null}
  </Dialog>
)

const ItemDetails = ({
  canReschedule,
  item,
  onClose,
  onReschedule,
  timezone,
  workspaceId,
}: {
  canReschedule: boolean
  item: CalendarItem
  onClose: () => void
  onReschedule: (change: RescheduleChange) => void
  timezone: string
  workspaceId: string
}) => {
  const t = useTranslations()
  const formatter = useFormatter()
  const statusLabel = useStatusLabel()
  const [draft, setDraft] = useState<Date | undefined>(
    item.at ? instantToWallClock(item.at, timezone) : undefined,
  )
  const [pastError, setPastError] = useState(false)
  // A draft is scheduled on purpose here, even when it was planned for a day already.
  const canSchedule =
    canReschedule && (item.isMovable || item.status === "draft")
  const isRescheduling = item.at !== null && item.status !== "draft"

  const save = () => {
    if (!draft) {
      return
    }
    const at = wallClockToInstant(draft, timezone)
    if (at.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      setPastError(true)
      return
    }
    onReschedule({
      at,
      kind: "schedule",
      postId: item.postId,
      targetId: item.targetId,
    })
    onClose()
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ProviderNetworkIcon
            className="size-4"
            decorative
            provider={item.provider}
          />
          {PROVIDER_LABELS[item.provider]} · {item.destinationName}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium text-xs",
              STATUS_TONES[item.status],
            )}
          >
            {statusLabel(item.status)}
          </span>
          {item.at ? (
            <span>
              {formatter.dateTime(item.at, {
                dateStyle: "full",
                timeStyle: "short",
                timeZone: timezone,
              })}
            </span>
          ) : (
            <span>{t("posts.calendar.noDate")}</span>
          )}
        </DialogDescription>
      </DialogHeader>

      <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm">
        {item.text?.trim() || t("posts.calendar.noText")}
      </p>

      {canSchedule ? (
        <div className="space-y-2">
          <p className="font-medium text-sm" id="calendar-reschedule-label">
            {isRescheduling
              ? t("posts.calendar.rescheduleLabel")
              : t("posts.calendar.scheduleLabel")}
          </p>
          <DateTimePicker
            disabled={{ before: new Date() }}
            displayFormat={{ hour24: PICKER_FORMAT }}
            granularity="minute"
            onChange={(value) => {
              setDraft(value)
              setPastError(false)
            }}
            placeholder={t("posts.calendar.pickTime")}
            value={draft}
          />
          {pastError ? (
            <p className="text-destructive text-sm" role="alert">
              {t("posts.calendar.errors.past")}
            </p>
          ) : null}
        </div>
      ) : null}

      <DialogFooter className="flex-wrap gap-2 sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={`/space/${workspaceId}/posts/${item.postId}/edit`}
          >
            {t("posts.calendar.openPost")}
          </Link>
          {item.permalink ? (
            <a
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={item.permalink}
              rel="noreferrer"
              target="_blank"
            >
              {t("composer.viewPost")}
              <ExternalLinkIcon />
            </a>
          ) : null}
          {item.canUnschedule ? (
            <Button
              onClick={() => {
                onReschedule({
                  kind: "unschedule",
                  postId: item.postId,
                  targetId: null,
                })
                onClose()
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("posts.calendar.moveToDrafts")}
            </Button>
          ) : null}
        </div>
        {canSchedule ? (
          <Button disabled={!draft} onClick={save} size="sm" type="button">
            {isRescheduling
              ? t("posts.calendar.reschedule")
              : t("posts.calendar.schedule")}
          </Button>
        ) : null}
      </DialogFooter>
    </DialogContent>
  )
}
