"use client"

import { isRecurringTemplate } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableRowCard } from "@chatbotx.io/ui/components/data-table/data-table-row-card"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef, Row } from "@tanstack/react-table"
import { format } from "date-fns"
import { CopyIcon, Loader2Icon, MoreHorizontalIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import type { listBroadcasts } from "@/features/broadcasts/queries"
import { useWorkspaceId } from "@/hooks/routing"
import { useIntervalRouterRefresh } from "@/hooks/use-interval-router-refresh"
import { BroadcastDetailDialog } from "./broadcast-detail-dialog"
import { CloneBroadcastDialog } from "./clone-broadcast-dialog"
import { BroadcastSeriesSummary } from "./components/broadcast-series-summary"
import { BroadcastStatsCell } from "./components/broadcast-stats-cell"
import { BroadcastStatusBadge } from "./components/broadcast-status-badge"
import { BroadcastsEmptyState } from "./components/broadcasts-empty-state"
import { BroadcastsTableToolbarActions } from "./components/broadcasts-table-toolbar-actions"
import { DeleteBroadcastDialog } from "./components/delete-broadcast-dialog"
import { MoveBroadcastToDraftDialog } from "./components/move-broadcast-to-draft-dialog"
import { ResumeBroadcastDialog } from "./components/resume-broadcast-dialog"
import { ScheduleBroadcastDialog } from "./components/schedule-broadcast-dialog"
import { StopBroadcastDialog } from "./components/stop-broadcast-dialog"
import { broadcastRunsHref } from "./lib/broadcast-links"
import {
  type BroadcastRowActionVariant,
  filterBroadcastRowActions,
  getBroadcastRowActions,
  ROW_ACTION_ITEMS,
  resolveBroadcastRowActionLabelKey,
} from "./lib/broadcast-row-actions"
import { BroadcastStatsStoreProvider } from "./provider/broadcast-stats-store-context"
import { RenameBroadcastDialog } from "./rename-broadcast-dialog"
import { ResendBroadcastDialog } from "./resend-broadcast-dialog"
import type { BroadcastResourceWithRelations } from "./schema/resource"
import { shouldShowBroadcastsEmptyState } from "./utils/empty-state"
import {
  getEstimatedContactsDisplayState,
  isBroadcastInProgress,
} from "./utils/estimated-contacts-display"

/** Scheduled/sending rows change on the worker side; poll the list while any is present. */
const BROADCAST_LIST_REFRESH_INTERVAL_MS = 30_000

type BroadcastsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listBroadcasts>>]>
  filtered: boolean
}

type BroadcastRowAction = {
  row: Row<BroadcastResourceWithRelations>
  variant: BroadcastRowActionVariant
}

const isPausedSeries = (broadcast: BroadcastResourceWithRelations) =>
  isRecurringTemplate(broadcast) && broadcast.status === "cancelled"

/** An armed series' next run that really sends; its `schedulesAt` is the armed slot, which may be a skipped date. */
const scheduledAtOf = (broadcast: BroadcastResourceWithRelations) =>
  isRecurringTemplate(broadcast) && broadcast.recurrence?.nextRunAt
    ? broadcast.recurrence.nextSendAt
    : broadcast.schedulesAt

export function BroadcastsTable({ promises, filtered }: BroadcastsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const isEmpty = shouldShowBroadcastsEmptyState({
    rowCount: data.length,
    pageCount,
  })

  const workspaceId = useWorkspaceId()
  // A repeating series sends nothing itself, so it has no stats to load.
  const broadcastIds = useMemo(
    () => data.filter((b) => !isRecurringTemplate(b)).map((b) => b.id),
    [data],
  )
  const hasInProgressBroadcast = useMemo(
    () => data.some((broadcast) => isBroadcastInProgress(broadcast.status)),
    [data],
  )
  useIntervalRouterRefresh({
    enabled: hasInProgressBroadcast,
    intervalMs: BROADCAST_LIST_REFRESH_INTERVAL_MS,
  })

  const t = useTranslations()
  const router = useRouter()

  const [rowAction, setRowAction] = useState<BroadcastRowAction | null>(null)

  const [, copyToClipboard] = useCopyToClipboard()
  const handleCopyId = useCallback(
    (id: string) => {
      copyToClipboard(id).then(() => {
        toast.success(t("messages.copiedToClipboard"))
      })
    },
    [copyToClipboard, t],
  )

  // A series shows its run count (a link to the runs page) where the first
  // stat would be, and nothing in the others: its runs carry the stats.
  const renderStatsCell = useCallback(
    (
      broadcast: BroadcastResourceWithRelations,
      field: React.ComponentProps<typeof BroadcastStatsCell>["field"],
    ) => {
      if (!isRecurringTemplate(broadcast)) {
        return <BroadcastStatsCell broadcastId={broadcast.id} field={field} />
      }
      if (field !== "message:sent") {
        return <span className="text-muted-foreground">-</span>
      }
      return (
        <Link
          className="text-primary text-sm underline-offset-4 hover:underline"
          href={broadcastRunsHref(workspaceId, broadcast.id)}
        >
          {t("broadcasts.recurring.runs", {
            count: broadcast.recurrence?.occurrenceCount ?? 0,
          })}
        </Link>
      )
    },
    [t, workspaceId],
  )

  const columns = useMemo<ColumnDef<BroadcastResourceWithRelations>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={table.getIsAllPageRowsSelected()}
            className="translate-y-0.5"
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("actions.selectRow")}
            checked={row.getIsSelected()}
            className="translate-y-0.5"
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 20,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "id",
        accessorKey: "id",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("broadcasts.fields.id")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <span className="max-w-[100px] truncate font-mono text-xs">
              {row.original.id}
            </span>
            <Button
              aria-label={t("actions.copy")}
              className="size-6 shrink-0"
              onClick={() => handleCopyId(row.original.id)}
              size="icon"
              variant="ghost"
            >
              <CopyIcon className="size-3" />
            </Button>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="inline-block max-w-[200px] truncate">
                    {row.original.name ?? ""}
                  </div>
                }
              />
              <TooltipContent>
                <p>{row.original.name ?? ""}</p>
              </TooltipContent>
            </Tooltip>
            <BroadcastSeriesSummary broadcast={row.original} />
          </div>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.placeholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableHiding: false,
      },
      {
        id: "channel",
        accessorKey: "channel",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.channel.label")}
          />
        ),
        cell: ({ row }) => (
          <div>{t(`fields.${row.original.channel}.label`)}</div>
        ),
        meta: {
          label: t("fields.channel.label"),
        },
        enableHiding: false,
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => (
          <BroadcastStatusBadge
            occurrenceAt={row.original.occurrenceAt}
            schedulesType={row.original.schedulesType}
            status={row.original.status}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        meta: {
          label: t("fields.status.label"),
        },
      },
      {
        accessorKey: "contactsCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.estimatedContacts.label")}
          />
        ),
        cell: ({ row }) => {
          if (isRecurringTemplate(row.original)) {
            return <span className="text-muted-foreground">-</span>
          }
          const displayState = getEstimatedContactsDisplayState({
            contactCount: row.original.contactCount,
            status: row.original.status,
          })

          if (displayState === "loading") {
            return <Loader2Icon className="h-4 w-4 animate-spin" />
          }

          if (displayState === "empty") {
            return <span className="text-muted-foreground">-</span>
          }

          return <div>{row.original.contactCount}</div>
        },
        meta: {
          label: t("fields.estimatedContacts.label"),
        },
        enableHiding: false,
      },
      {
        id: "sent",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("broadcasts.stats.sent")}
          />
        ),
        cell: ({ row }) => renderStatsCell(row.original, "message:sent"),
        meta: {
          label: t("broadcasts.stats.sent"),
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "delivered",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("broadcasts.stats.delivered")}
          />
        ),
        cell: ({ row }) => renderStatsCell(row.original, "message:delivered"),
        meta: {
          label: t("broadcasts.stats.delivered"),
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "seen",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("broadcasts.stats.seen")}
          />
        ),
        cell: ({ row }) => renderStatsCell(row.original, "message:seen"),
        meta: {
          label: t("broadcasts.stats.seen"),
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "clicked",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("broadcasts.stats.clicked")}
          />
        ),
        cell: ({ row }) => renderStatsCell(row.original, "flow:clicked"),
        meta: {
          label: t("broadcasts.stats.clicked"),
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "failed",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("broadcasts.stats.failed")}
          />
        ),
        cell: ({ row }) => renderStatsCell(row.original, "message:failed"),
        meta: {
          label: t("broadcasts.stats.failed"),
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "schedulesAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.scheduledAt.label")}
          />
        ),
        cell: ({ row }) => {
          // A paused series keeps its last `schedulesAt`, a time at which
          // nothing will run.
          const scheduledAt = isPausedSeries(row.original)
            ? null
            : scheduledAtOf(row.original)
          return scheduledAt ? (
            <div>{format(scheduledAt, "yyyy/MM/dd HH:mm")}</div>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        },
        meta: {
          label: t("fields.scheduledAt.label"),
        },
        enableHiding: false,
      },
      {
        id: "actions",
        header: t("actions.actions"),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon" variant="ghost">
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">{t("actions.openMenu")}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {filterBroadcastRowActions(
                getBroadcastRowActions(row.original.status),
                row.original,
              ).map((variant) => {
                const { icon: ActionIcon } = ROW_ACTION_ITEMS[variant]
                const labelKey = resolveBroadcastRowActionLabelKey(
                  variant,
                  row.original,
                )
                return (
                  <DropdownMenuItem
                    key={variant}
                    onClick={() => {
                      // Edit and the runs list are pages, not dialogs.
                      if (variant === "edit") {
                        router.push(
                          `/space/${workspaceId}/broadcasts/${row.original.id}/edit`,
                        )
                      } else if (variant === "viewRuns") {
                        router.push(
                          broadcastRunsHref(workspaceId, row.original.id),
                        )
                      } else {
                        setRowAction({ row, variant })
                      }
                    }}
                  >
                    <ActionIcon className="me-2" />
                    {t(labelKey)}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, router, workspaceId, handleCopyId, renderStatsCell],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <BroadcastStatsStoreProvider
      broadcastIds={broadcastIds}
      workspaceId={workspaceId}
    >
      {isEmpty ? (
        <BroadcastsEmptyState filtered={filtered} />
      ) : (
        <div className="flex flex-col gap-4 p-6">
          <DataTable
            mobileCard={(row) => <DataTableRowCard row={row} />}
            table={table}
          >
            <div className="flex items-center justify-end p-1">
              <BroadcastsTableToolbarActions
                table={table}
                workspaceId={workspaceId}
              />
            </div>
          </DataTable>
        </div>
      )}

      <RenameBroadcastDialog
        broadcast={rowAction?.row.original ?? null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "rename"}
      />

      <ResendBroadcastDialog
        broadcast={rowAction?.row.original ?? null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "resend"}
      />

      <CloneBroadcastDialog
        broadcast={rowAction?.row.original ?? null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "clone"}
      />

      <ScheduleBroadcastDialog
        broadcast={rowAction?.row.original ?? null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "schedule"}
      />

      <MoveBroadcastToDraftDialog
        broadcast={rowAction?.row.original ?? null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "moveToDraft"}
      />

      <StopBroadcastDialog
        broadcast={rowAction?.row.original ?? null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "stop"}
      />

      <ResumeBroadcastDialog
        broadcast={rowAction?.row.original ?? null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "resume"}
      />

      <DeleteBroadcastDialog
        broadcasts={rowAction?.row.original ? [rowAction.row.original] : []}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "delete"}
        workspaceId={workspaceId}
      />

      <BroadcastDetailDialog
        broadcast={rowAction?.row.original ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setRowAction(null)
          }
        }}
        open={rowAction?.variant === "view"}
      />
    </BroadcastStatsStoreProvider>
  )
}
