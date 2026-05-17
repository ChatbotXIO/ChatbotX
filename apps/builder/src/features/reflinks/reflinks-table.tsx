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
import {
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { use, useMemo } from "react"
import { GetInboxUrlDialog } from "../inboxes/components/get-inbox-url"
import { DeleteReflinksDialog } from "./delete-reflinks"
import { ReflinksTableToolbarActions } from "./reflinks-table-toolbar-actions"
import type { ListReflinkItem, ListReflinksResponse } from "./schemas/query"
import { UpdateReflinkDialog } from "./update-reflink"

type ReflinksTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ListReflinksResponse>]>
}

export function ReflinksTable({ workspaceId, promises }: ReflinksTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<ListReflinkItem> | null>(null)

  const columns = useMemo<ColumnDef<ListReflinkItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table: tableData }) => (
          <Checkbox
            aria-label="Select all"
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
            aria-label="Select row"
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
        id: "keyword",
        accessorKey: "keyword",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[200px] truncate">{row.original.name}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.name}</p>
            </TooltipContent>
          </Tooltip>
        ),
        meta: {
          label: t("fields.keyword.label"),
          placeholder: t("fields.keyword.searchPlaceholder"),
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
              <div className="max-w-[200px] truncate">
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
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "copyUrl" })}
              >
                <LinkIcon />
                {t("actions.copyUrl")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "update" })}
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
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("reflinks.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <ReflinksTableToolbarActions
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <GetInboxUrlDialog
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "copyUrl"}
          refConfig={{
            type: "reflink",
            name: rowAction?.row.original?.name ?? "",
          }}
        />

        <UpdateReflinkDialog
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "update"}
          reflink={rowAction?.row.original ?? null}
          workspaceId={workspaceId}
        />

        <DeleteReflinksDialog
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            router.refresh()
          }}
          open={rowAction?.variant === "delete"}
          reflinks={rowAction?.row.original ? [rowAction?.row.original] : []}
          showTrigger={false}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
