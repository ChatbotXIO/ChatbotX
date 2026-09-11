"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import type { ColumnDef } from "@tanstack/react-table"
import {
  type CommentAutomationStatField,
  CommentAutomationStatsCell,
  commentAutomationStatCounters,
} from "./comment-automation-stats-cell"

/** The counter columns every comment automation row carries. */
export type CommentAutomationStatRow = {
  id: string
} & Record<
  (typeof commentAutomationStatCounters)[CommentAutomationStatField],
  number
>

const STAT_COLUMNS: { id: string; field: CommentAutomationStatField }[] = [
  { id: "sent", field: "message:sent" },
  { id: "delivered", field: "message:delivered" },
  { id: "seen", field: "message:seen" },
  { id: "clicked", field: "flow:clicked" },
  { id: "failed", field: "message:failed" },
]

/**
 * The five delivery columns, shared by the Facebook and Instagram list tables —
 * they render the same `FBCommentAutomation` rows and differ only in the URL
 * prefix, so duplicating these definitions would only be two places to drift.
 *
 * Unlike broadcast's equivalent this needs no stats store: the counters are
 * columns on the row itself, already in hand by the time the table renders.
 */
export function buildCommentAutomationStatColumns<
  TRow extends CommentAutomationStatRow,
>(props: {
  workspaceId: string
  t: (key: string) => string
}): ColumnDef<TRow>[] {
  const { workspaceId, t } = props

  return STAT_COLUMNS.map(({ id, field }) => ({
    id,
    header: ({ column }) => (
      <DataTableColumnHeader
        className="w-full justify-center"
        column={column}
        title={t(`commentAutomation.stats.${id}`)}
      />
    ),
    cell: ({ row }) => (
      <div className="text-center">
        <CommentAutomationStatsCell
          automationId={row.original.id}
          field={field}
          sent={row.original.sentCount}
          value={row.original[commentAutomationStatCounters[field]]}
          workspaceId={workspaceId}
        />
      </div>
    ),
    meta: { label: t(`commentAutomation.stats.${id}`) },
    // Counters are not part of the list query's sort surface, and the dialog is
    // the drill-down, so neither sorting nor hiding has anything to act on.
    enableSorting: false,
    size: 110,
  }))
}
