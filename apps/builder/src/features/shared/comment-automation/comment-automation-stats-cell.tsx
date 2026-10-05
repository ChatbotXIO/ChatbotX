"use client"

import { useFormatter } from "next-intl"
import { memo, useCallback, useState } from "react"
import { CommentAutomationContactsDialog } from "./comment-automation-contacts-dialog"
import type { CommentAutomationStatField } from "./lib/stat-counters"

type Props = {
  workspaceId: string
  automationId: string
  field: CommentAutomationStatField
  value: number
  /**
   * What this column's rate is measured against. The delivery columns divide by
   * attempts (`sentCount`); Misses divides by the comments the automation
   * engaged with (`repliesCount + missedCount`), because an attempt and a
   * decline are different events and `sentCount` counts attempts on one half
   * of the comment only.
   */
  denominator: number
}

export const CommentAutomationStatsCell = memo(
  function CommentAutomationStatsCell({
    workspaceId,
    automationId,
    field,
    value,
    denominator,
  }: Props) {
    const formatter = useFormatter()
    const [dialogOpen, setDialogOpen] = useState(false)

    const handleClick = useCallback(() => {
      setDialogOpen(true)
    }, [])

    const handleDialogChange = useCallback((open: boolean) => {
      setDialogOpen(open)
    }, [])

    // Sent IS the denominator for the delivery columns, so it has nothing to
    // compare itself to. Misses suppresses its rate whenever the denominator is
    // nothing but the misses themselves — a bare "100%" on an automation that
    // has answered nothing its counters measure (a Messenger automation
    // replying publicly only, which counts zero replies by design) says nothing
    // true about it, while the raw count still does.
    const rateIsMeaningless =
      field === "message:sent" ||
      !value ||
      !denominator ||
      (field === "comment:missed" && denominator === value)
    const percentage = rateIsMeaningless
      ? null
      : ((value / denominator) * 100).toFixed(1)

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
