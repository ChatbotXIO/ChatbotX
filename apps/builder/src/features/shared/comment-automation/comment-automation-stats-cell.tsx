"use client"

import type { CommentAutomationEventType } from "@chatbotx.io/analytics/schemas"
import { useFormatter } from "next-intl"
import { memo, useCallback, useState } from "react"
import { CommentAutomationContactsDialog } from "./comment-automation-contacts-dialog"

/**
 * Which lifetime counter on the automation row backs each column. The counters
 * live on `FBCommentAutomation` rather than being aggregated from
 * `FBCommentAutomationEvent`, which a nightly cron purges after 30 days — so
 * unlike `BroadcastStatsCell` this needs no fetch and no store at all: the
 * numbers arrive with the row.
 */
export const commentAutomationStatCounters = {
  "message:sent": "sentCount",
  "message:delivered": "deliveredCount",
  "message:seen": "seenCount",
  "flow:clicked": "clickedCount",
  "message:failed": "failedCount",
} as const satisfies Partial<Record<CommentAutomationEventType, string>>

export type CommentAutomationStatField =
  keyof typeof commentAutomationStatCounters

type Props = {
  workspaceId: string
  automationId: string
  field: CommentAutomationStatField
  value: number
  sent: number
}

export const CommentAutomationStatsCell = memo(
  function CommentAutomationStatsCell({
    workspaceId,
    automationId,
    field,
    value,
    sent,
  }: Props) {
    const formatter = useFormatter()
    const [dialogOpen, setDialogOpen] = useState(false)

    const handleClick = useCallback(() => {
      setDialogOpen(true)
    }, [])

    const handleDialogChange = useCallback((open: boolean) => {
      setDialogOpen(open)
    }, [])

    // Every rate is against attempts, so Sent itself has nothing to compare to.
    const percentage =
      field === "message:sent" || !value || !sent
        ? null
        : ((value / sent) * 100).toFixed(1)

    return (
      <>
        <button
          className={
            value
              ? "cursor-pointer tabular-nums hover:underline"
              : "tabular-nums"
          }
          disabled={!value}
          onClick={handleClick}
          type="button"
        >
          {value ? formatter.number(value) : "----"}
          {percentage && (
            <span className="ms-1 text-muted-foreground">({percentage}%)</span>
          )}
        </button>

        <CommentAutomationContactsDialog
          automationId={automationId}
          eventType={field}
          onOpenChange={handleDialogChange}
          open={dialogOpen}
          total={value}
          workspaceId={workspaceId}
        />
      </>
    )
  },
)
