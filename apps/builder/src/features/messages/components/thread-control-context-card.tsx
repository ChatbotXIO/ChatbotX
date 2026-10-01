"use client"

import type { ThreadControlHistoryItem } from "@chatbotx.io/sdk"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { format } from "date-fns"
import { SparklesIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { ThreadControlContextCard as ThreadControlContextCardData } from "../lib/thread-control-content"

/** History rows shown before "Show all". */
const HISTORY_PREVIEW_COUNT = 5
const SECONDS_TO_MS = 1000

const SENDER_LABEL_KEYS = {
  user: "conversationRouting.context.customer",
  business: "conversationRouting.context.business",
} as const satisfies Record<ThreadControlHistoryItem["sender"], string>

const formatHistoryTime = (timestamp: string | undefined): string | null => {
  const seconds = Number(timestamp)
  if (!(timestamp && Number.isFinite(seconds))) {
    return null
  }
  return format(new Date(seconds * SECONDS_TO_MS), "HH:mm")
}

const HistoryRows = ({ items }: { items: ThreadControlHistoryItem[] }) => {
  const t = useTranslations()
  const [isExpanded, setIsExpanded] = useState(false)
  const visibleItems = isExpanded
    ? items
    : items.slice(0, HISTORY_PREVIEW_COUNT)

  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1.5">
        {visibleItems.map((item, index) => {
          const time = formatHistoryTime(item.timestamp)
          return (
            // History items carry no id; their order is the identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered list
            <li className="text-sm" key={index}>
              <span className="font-medium">
                {t(SENDER_LABEL_KEYS[item.sender])}
              </span>
              {time && (
                <span className="ms-1.5 text-muted-foreground text-xs">
                  {time}
                </span>
              )}
              <p className="wrap-break-word whitespace-pre-line text-foreground/90">
                {item.text}
              </p>
            </li>
          )
        })}
      </ul>
      {items.length > HISTORY_PREVIEW_COUNT && (
        <Button
          className="h-7 self-start px-2 text-xs"
          onClick={() => setIsExpanded((current) => !current)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {isExpanded
            ? t("conversationRouting.context.showLess")
            : t("conversationRouting.context.showAll", { count: items.length })}
        </Button>
      )}
    </div>
  )
}

/**
 * The context a previous owner handed over (Meta's opaque summary, or the
 * history lines), plus the handover note. Display only; empty or invalid
 * contexts are never stored, so there is no empty state.
 */
export function ThreadControlContextCard({
  data,
}: {
  data: ThreadControlContextCardData
}) {
  const t = useTranslations()
  const { context, handoverNote } = data

  return (
    <div className="mx-auto my-2 flex w-full max-w-md flex-col gap-2 rounded-xl border bg-card px-4 py-3 text-start text-card-foreground shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium text-sm">
          <SparklesIcon aria-hidden className="size-4 text-primary" />
          {t("conversationRouting.context.title")}
        </span>
        {context && (
          <Badge variant="secondary">
            {context.type === "summary"
              ? t("conversationRouting.context.summaryBadge")
              : t("conversationRouting.context.historyBadge")}
          </Badge>
        )}
      </div>
      {/* Context is absent when the previous owner had standby access; the note
          then stands alone (no divider above it). */}
      {context &&
        (context.type === "summary" ? (
          <p className="wrap-break-word whitespace-pre-line text-sm">
            {context.text}
          </p>
        ) : (
          <HistoryRows items={context.items} />
        ))}
      {handoverNote && (
        <p
          className={
            context
              ? "border-t pt-2 text-muted-foreground text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {t("conversationRouting.context.handoverNote", {
            note: handoverNote,
          })}
        </p>
      )}
    </div>
  )
}
