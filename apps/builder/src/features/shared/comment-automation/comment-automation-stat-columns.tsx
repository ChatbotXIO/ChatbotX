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
  /** Half of the Misses denominator; see `resolveDenominator`. */
  repliesCount: number
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
  { id: "missed", field: "comment:missed" },
]

/**
 * The columns a channel without a comment-anchored DM can never fill. Its
 * counters are taken from the public comment reply instead (see
 * `countsTowardStats`), and a comment reply has no read receipt and carries no
 * button, so these two would sit at `----` on every row forever. Hidden rather
 * than shown empty: a column that cannot have a value reads as a bug in the
 * automation, not as a property of the channel.
 */
const DM_ONLY_STAT_FIELDS = new Set<CommentAutomationStatField>([
  "message:seen",
  "flow:clicked",
])

/**
 * What each column's rate is measured against.
 *
 * The delivery columns divide by attempts. Misses cannot: a decline is not an
 * attempt, and `sentCount` counts attempts on one half of the comment only —
 * the DM, or the public reply on a channel with no DM — so dividing by it
 * would compare two different populations. It divides instead by the comments
 * the automation actually engaged with — answered, or passed on.
 */
function resolveDenominator(
  field: CommentAutomationStatField,
  row: CommentAutomationStatRow,
): number {
  if (field === "comment:missed") {
    return row.repliesCount + row.missedCount
  }
  return row.sentCount
}

/**
 * The stat columns, shared by the Facebook, Instagram, TikTok and Threads list
 * tables — they render the same `CommentAutomation` rows and differ only in the
 * URL prefix, so duplicating these definitions would only be places to drift.
 *
 * `supportsPrivateReply` says whether the channel has a comment-anchored DM;
 * pass `false` — Threads is the only such channel — and Seen and Clicked are
 * dropped, because on such a channel the counters measure the public comment
 * reply, which has neither. It describes the CHANNEL, not the automation: a
 * Messenger automation configured with no private branch keeps all six columns
 * and simply reads zero, the same as it always has.
 *
 * Unlike broadcast's equivalent this needs no stats store: the counters are
 * columns on the row itself, already in hand by the time the table renders.
 */
export function buildCommentAutomationStatColumns<
  TRow extends CommentAutomationStatRow,
>(props: {
  workspaceId: string
  t: (key: string) => string
  supportsPrivateReply?: boolean
}): ColumnDef<TRow>[] {
  const { workspaceId, t, supportsPrivateReply = true } = props
  const columns = supportsPrivateReply
    ? STAT_COLUMNS
    : STAT_COLUMNS.filter(({ field }) => !DM_ONLY_STAT_FIELDS.has(field))

  return columns.map(({ id, field }) => ({
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
          denominator={resolveDenominator(field, row.original)}
          field={field}
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
