"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useDroppable } from "@dnd-kit/core"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"

/** The id a drop on the "No date" panel carries. */
export const NO_DATE_DROP_ID = "no-date"

const DAY_DROP_PREFIX = "day:"

const dayDropId = (dayKeyValue: string): string =>
  `${DAY_DROP_PREFIX}${dayKeyValue}`

/** The day a drop id stands for, or `null` for any other drop target. */
export const dayFromDropId = (dropId: string): string | null =>
  dropId.startsWith(DAY_DROP_PREFIX)
    ? dropId.slice(DAY_DROP_PREFIX.length)
    : null

/** A day cell that accepts drops (unless it is in the past) and, when allowed, links to the composer for that day. */
export const CalendarDropCell = ({
  children,
  className,
  composeHref,
  day,
  dayKeyValue,
  droppable,
}: {
  children: ReactNode
  className: string
  /** Where "new post on this day" goes; `null` hides the link (past day, read-only). */
  composeHref: string | null
  day: Date
  dayKeyValue: string
  droppable: boolean
}) => {
  const t = useTranslations()
  const formatter = useFormatter()
  const { isOver, setNodeRef } = useDroppable({
    disabled: !droppable,
    id: dayDropId(dayKeyValue),
  })
  return (
    <div
      className={cn(
        className,
        "group relative",
        isOver && "bg-primary/10 ring-2 ring-primary ring-inset",
      )}
      ref={setNodeRef}
    >
      {children}
      {composeHref ? (
        <Link
          aria-label={t("posts.calendar.newPostOn", {
            date: formatter.dateTime(day, {
              day: "numeric",
              month: "long",
              weekday: "long",
            }),
          })}
          className="absolute start-1 top-1 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100"
          href={composeHref}
        >
          <PlusIcon className="size-3.5" />
        </Link>
      ) : null}
    </div>
  )
}
