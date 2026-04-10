"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
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
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCwIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { useMemo, useState } from "react"
import type { listBroadcasts } from "@/features/broadcasts/queries"
import { useWorkspaceId } from "@/hooks/routing"
import { BroadcastStatsCell } from "./components/broadcast-stats-cell"
import { RenameBroadcastDialog } from "./rename-broadcast-dialog"
import { ResendBroadcastDialog } from "./resend-broadcast-dialog"
import type { BroadcastResourceWithRelations } from "./schemas/resource"

type BroadcastsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listBroadcasts>>]>
}

export function BroadcastsTable({ promises }: BroadcastsTableProps) {
  const [{ data, pageCount }] = React.use(promises)

  const workspaceId = useWorkspaceId()

  const t = useTranslations()
  const router = useRouter()

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<BroadcastResourceWithRelations> | null>(null)

  const columns = useMemo<ColumnDef<BroadcastResourceWithRelations>[]>(
    () => [
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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[200px] truncate">
                {row.original.name ?? ""}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.name ?? ""}</p>
            </TooltipContent>
          </Tooltip>
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
        cell: ({ row }) =>
          row.original.status === "scheduled" ? (
            <Badge variant="outline">
              {t(`broadcasts.status.${row.original.status}`)}
            </Badge>
          ) : (
            <Badge variant="default">
              {t(`broadcasts.status.${row.original.status}`)}
            </Badge>
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
        cell: ({ row }) => <div>{row.original.contactsCount ?? 0}</div>,
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
        cell: ({ row }) => (
          <BroadcastStatsCell broadcastId={row.original.id} field="sent" />
        ),
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
        cell: ({ row }) => (
          <BroadcastStatsCell broadcastId={row.original.id} field="delivered" />
        ),
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
        cell: ({ row }) => (
          <BroadcastStatsCell broadcastId={row.original.id} field="seen" />
        ),
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
        cell: ({ row }) => (
          <BroadcastStatsCell broadcastId={row.original.id} field="clicked" />
        ),
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
        cell: ({ row }) => (
          <BroadcastStatsCell broadcastId={row.original.id} field="failed" />
        ),
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
        cell: ({ row }) => (
          <div>{format(row.original.schedulesAt, "yyyy/MM/dd HH:mm")}</div>
        ),
        meta: {
          label: t("fields.scheduledAt.label"),
        },
        enableHiding: false,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <MoreHorizontalIcon className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "rename" })}
              >
                <PencilIcon className="mr-2" />
                {t("actions.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "resend" })}
              >
                <RotateCwIcon className="mr-2" />
                {t("actions.resend")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t],
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
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <div className="flex justify-end">
            <Button asChild size="sm">
              <Link href={`/space/${workspaceId}/broadcasts/create`}>
                <PlusIcon />
                {t("actions.createFeature", {
                  feature: t("fields.broadcast.label"),
                })}
              </Link>
            </Button>
          </div>
        </DataTableToolbar>
      </DataTable>

      <RenameBroadcastDialog
        broadcast={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "rename"}
      />

      <ResendBroadcastDialog
        broadcast={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "resend"}
      />
    </>
  )
}
