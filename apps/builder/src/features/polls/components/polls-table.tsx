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
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  BarChart3Icon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import React, { use, useMemo, useState } from "react"
import type { PollListItem } from "../schema/resource"
import { DeletePollsDialog } from "./delete-polls-dialog"
import { GetLinkDialog } from "./get-link-dialog"

type PollsTableProps = {
  workspaceId: string
  promises: Promise<[{ data: PollListItem[]; pageCount: number }]>
}

export function PollsTable({ workspaceId, promises }: PollsTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const locale = useLocale()
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<PollListItem> | null>(null)
  const [linkPollId, setLinkPollId] = useState<string | null>(null)

  const columns = useMemo<ColumnDef<PollListItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table: tableData }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={tableData.getIsAllPageRowsSelected()}
            className="translate-y-0.5"
            indeterminate={tableData.getIsSomePageRowsSelected()}
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
        cell: ({ row }) => (
          <Link
            className="block w-fit max-w-60 truncate"
            href={`/space/${workspaceId}/polls/${row.original.id}/edit`}
            title={row.original.name}
          >
            {row.original.name}
          </Link>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableSorting: false,
      },
      {
        id: "startsAt",
        accessorKey: "startsAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("pollManager.list.startDate")}
          />
        ),
        cell: ({ row }) => (
          <span>{formatDate(row.original.startsAt, { locale })}</span>
        ),
        enableSorting: false,
      },
      {
        id: "endsAt",
        accessorKey: "endsAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("pollManager.list.endDate")}
          />
        ),
        cell: ({ row }) => (
          <span>{formatDate(row.original.endsAt, { locale })}</span>
        ),
        enableSorting: false,
      },
      {
        id: "votesCount",
        accessorKey: "votesCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("pollManager.list.votes")}
          />
        ),
        cell: ({ row }) => <span>{row.original.votesCount}</span>,
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
            <DropdownMenuTrigger
              render={
                <Button size="icon" variant="ghost">
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">{t("actions.openMenu")}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/space/${workspaceId}/polls/${row.original.id}/edit`,
                  )
                }
              >
                <PencilIcon />
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLinkPollId(row.original.id)}>
                <LinkIcon />
                {t("pollManager.list.getLink")}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href={`/space/${workspaceId}/polls/${row.original.id}/analytics`}
                  >
                    <BarChart3Icon />
                    {t("actions.viewAnalytics")}
                  </Link>
                }
              />
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
    [t, router, workspaceId, locale],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: { columnPinning: { right: ["action"] } },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("pollManager.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <div className="flex items-center gap-2">
              {table.getFilteredSelectedRowModel().rows.length > 0 ? (
                <DeletePollsDialog
                  onSuccess={() => table.toggleAllRowsSelected(false)}
                  polls={table
                    .getFilteredSelectedRowModel()
                    .rows.map((row) => row.original)}
                  workspaceId={workspaceId}
                />
              ) : null}
            </div>
            <Button
              nativeButton={false}
              render={<Link href={`/space/${workspaceId}/polls/create`} />}
              size="sm"
            >
              <PlusIcon />
              {t("actions.add")}
            </Button>
          </DataTableToolbar>
        </DataTable>

        <DeletePollsDialog
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "delete"}
          polls={rowAction?.row.original ? [rowAction.row.original] : []}
          showTrigger={false}
          workspaceId={workspaceId}
        />
        <GetLinkDialog
          onOpenChange={(open) => {
            if (!open) {
              setLinkPollId(null)
            }
          }}
          pollId={linkPollId}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
