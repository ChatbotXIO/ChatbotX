"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { use, useMemo } from "react"
import { DeleteRefLinksDialog } from "./delete-ref-links-dialog"
import GetRefLinkDialog from "./get-ref-link-dialog"
import type { getRefLinks } from "./queries"
import { RefLinksTableToolbarActions } from "./ref-links-table-toolbar-actions"
import type { RefLinkResource } from "./schemas/types"

type RefLinksTableProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getRefLinks>>]>
}

export function RefLinksTable({ chatbotId, promises }: RefLinksTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<RefLinkResource> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to memoize the columns
  const columns = useMemo<ColumnDef<RefLinkResource>[]>(
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
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "name",
        accessorKey: "name",
        size: 100,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => {
          const { id, name } = row.original
          return (
            <Link
              href={`/chatbots/${chatbotId}/ref-links/${id}/edit?${searchParams.toString()}`}
            >
              {name}
            </Link>
          )
        },
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.placeholder"),
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
        cell: ({ row }) => row.original.flow?.name,
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
              <GetRefLinkDialog
                chatbotId={chatbotId}
                refLink={row.original}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <LinkIcon />
                    {t("actions.getLink")}
                  </DropdownMenuItem>
                }
              />

              <DropdownMenuItem asChild>
                <Link
                  href={`/chatbots/${chatbotId}/ref-links/${row.original.id}/edit`}
                >
                  <PencilIcon />
                  {t("actions.update")}
                </Link>
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
    [],
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
          <RefLinksTableToolbarActions chatbotId={chatbotId} table={table} />
        </DataTableToolbar>
      </DataTable>

      <DeleteRefLinksDialog
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "delete"}
        refLinks={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
      />
    </>
  )
}
