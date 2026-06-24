"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
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
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { use, useMemo } from "react"
import { stripQrPrefix } from "./constants"
import { DeleteQrCodesDialog } from "./delete-qr-codes"
import { QrCodesTableToolbarActions } from "./qr-codes-table-toolbar-actions"
import type { ListQrCodeItem, ListQrCodesResponse } from "./schemas/query"

type QrCodesTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ListQrCodesResponse>]>
}

export function QrCodesTable({ workspaceId, promises }: QrCodesTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<ListQrCodeItem> | null>(null)

  const columns = useMemo<ColumnDef<ListQrCodeItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table: tableData }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={
              tableData.getIsAllPageRowsSelected() ||
              (tableData.getIsSomePageRowsSelected() && "indeterminate")
            }
            className="translate-y-0.5"
            onCheckedChange={(value) =>
              tableData.toggleAllPageRowsSelected(Boolean(value))
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
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => {
          const displayName = stripQrPrefix(row.original.name)
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-50 truncate">{displayName}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{displayName}</p>
              </TooltipContent>
            </Tooltip>
          )
        },
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
      },
      {
        id: "flowId",
        accessorKey: "flowId",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.botResponse.label")}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-block max-w-[200px] truncate">
                {row.original.flow.name}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.flow.name}</p>
            </TooltipContent>
          </Tooltip>
        ),
        enableSorting: false,
        meta: {
          label: t("fields.botResponse.label"),
        },
      },
      {
        id: "size",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.size.label")}
          />
        ),
        cell: ({ row }) => <span>{row.original.qrStyles?.size ?? "-"}</span>,
        enableSorting: false,
      },
      {
        id: "action",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <MoreHorizontalIcon className="h-4 w-4" />
                <span className="sr-only">{t("actions.openMenu")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/space/${workspaceId}/qr-codes/${row.original.id}/edit`,
                  )
                }
              >
                <PencilIcon />
                {t("actions.edit")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "delete" })}
                variant="destructive"
              >
                <Trash2Icon />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, router, workspaceId],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      columnPinning: { right: ["action"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("qrCodes.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <QrCodesTableToolbarActions
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteQrCodesDialog
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "delete"}
          qrCodes={rowAction?.row.original ? [rowAction?.row.original] : []}
          showTrigger={false}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
