"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useDraggable } from "@dnd-kit/core"
import { useFormatter, useTranslations } from "next-intl"
import { useStatusLabel } from "../../hooks/use-status-label"
import type { CalendarItem } from "../../lib/calendar-items"
import {
  PROVIDER_MARKS,
  PROVIDER_TONES,
  STATUS_TONES,
} from "../../lib/calendar-tones"
import { PROVIDER_LABELS } from "../../lib/composer-state"

/**
 * The word a chip carries before its text. A draft that has a date says
 * "Draft" (so it is not read as scheduled); a failed or unconfirmed destination
 * says "Failed" in red. Other states are told by the chip's colour alone.
 */
const chipLabelOf = (
  item: CalendarItem,
): { className: string; key: ChipLabelKey } | null => {
  if (item.status === "draft") {
    return item.at ? { className: "font-semibold", key: "draft" } : null
  }
  if (item.status === "failed" || item.status === "needsReview") {
    return {
      className: "font-semibold text-red-700 dark:text-red-300",
      key: "failed",
    }
  }
  return null
}

type ChipLabelKey = "draft" | "failed"

export const itemKey = (item: CalendarItem): string =>
  `${item.postId}:${item.targetId ?? "post"}`

/** A post's slot on the calendar: network mark, time, text. Draggable while it can still move. */
export const CalendarChip = ({
  dragEnabled,
  item,
  onOpen,
  showTime,
  timezone,
  variant,
}: {
  dragEnabled: boolean
  item: CalendarItem
  onOpen: (item: CalendarItem) => void
  showTime: boolean
  timezone: string
  variant: "chip" | "row"
}) => {
  const t = useTranslations()
  const formatter = useFormatter()
  const statusLabel = useStatusLabel()
  const chipLabel = chipLabelOf(item)
  const chipLabelText = {
    draft: t("posts.calendar.status.draft"),
    failed: t("composer.status.failed"),
  } satisfies Record<ChipLabelKey, string>
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    data: { item },
    disabled: !(dragEnabled && item.isMovable),
    id: itemKey(item),
  })

  return (
    <button
      className={cn(
        "flex items-center gap-1.5 rounded text-start text-xs focus-visible:outline-2 focus-visible:outline-ring",
        variant === "chip" ? "truncate px-1 py-0.5" : "gap-3 px-3 py-2 text-sm",
        STATUS_TONES[item.status],
        isDragging && "opacity-40",
        dragEnabled && item.isMovable && "cursor-grab touch-none",
      )}
      onClick={() => onOpen(item)}
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
    >
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 rounded px-1 font-semibold text-[10px] leading-4",
          PROVIDER_TONES[item.provider],
        )}
      >
        {PROVIDER_MARKS[item.provider]}
      </span>
      <span className="sr-only">
        {PROVIDER_LABELS[item.provider]} · {statusLabel(item.status)}
      </span>
      {showTime && item.at ? (
        <span className="shrink-0 tabular-nums">
          {formatter.dateTime(item.at, {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: timezone,
          })}
        </span>
      ) : null}
      {chipLabel ? (
        <span
          aria-hidden="true"
          className={cn("shrink-0", chipLabel.className)}
        >
          {chipLabelText[chipLabel.key]}
        </span>
      ) : null}
      <span className="truncate">
        {item.text?.trim() || t("posts.calendar.noText")}
      </span>
    </button>
  )
}
