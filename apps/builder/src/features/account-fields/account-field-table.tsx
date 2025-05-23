"use client"

import { DataTable } from "@/components/data-table"
import { DataTableColumnHeader } from "@/components/data-table-column-header"
import { DataTableToolbar } from "@/components/data-table-toolbar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDataTable } from "@/hooks/use-data-table"
import type { DataTableRowAction } from "@/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  FingerprintIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TextIcon,
  Trash2Icon,
} from "lucide-react"
import { use, useMemo, useState } from "react"
import { DeleteAccountFieldsDialog } from "./delete-account-fields-dialog"
import type { listAccountFields } from "./queries/list-account-fields.query"
import type { AccountFieldResource } from "./schemas/types"
import { UpdateAccountFieldDialog } from "./update-account-field-dialog"
import { AccountFieldToolbarActions } from "./account-field-table-toolbar"
import { useCopyToClipboard } from "usehooks-ts"
import { Separator } from "@/components/ui/separator"
import { useTranslate } from "@tolgee/react"

interface FieldsTableProps {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof listAccountFields>>]>
}

export function AccountFieldsTable({ chatbotId, promises }: FieldsTableProps) {
  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AccountFieldResource> | null>(null)
  const [_, copyToClipboard] = useCopyToClipboard()
  const { t } = useTranslate()

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo<ColumnDef<AccountFieldResource>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        size: 32,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <>
            <div>{row.original.name}</div>
            <div className="text-gray-400">{row.original.description}</div>
          </>
        ),
        enableSorting: true,
        enableHiding: false,
        meta: {
          placeholder: "Search name...",
          variant: "text",
          icon: TextIcon,
        },
        enableColumnFilter: true,
      },
      {
        accessorKey: "customFieldType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => <div>{row.original.customFieldType}</div>,
        enableSorting: false,
      },
      {
        accessorKey: "value",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Value" />
        ),
        cell: ({ row }) => {
          return <div>{row.original.value}</div>
        },
        enableHiding: false,
        enableSorting: false,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "update" })}
                >
                  <PencilIcon />
                  {t("common.updateBtn")}
                </DropdownMenuItem>
                {/* <DropdownMenuItem onClick={() => setRowAction({ row, variant: "move" })}>Change folder</DropdownMenuItem> */}
                <DropdownMenuItem
                  onClick={() => copyToClipboard(row.original.id)}
                >
                  <FingerprintIcon />
                  {t("common.getIdBtn")}
                </DropdownMenuItem>
                <Separator className="my-1" />
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "delete" })}
                  variant="destructive"
                >
                  <Trash2Icon />
                  {t("common.deleteBtn")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
        size: 50,
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
          <AccountFieldToolbarActions chatbotId={chatbotId} table={table} />
        </DataTableToolbar>
      </DataTable>

      <DeleteAccountFieldsDialog
        open={rowAction?.variant === "delete"}
        onOpenChange={() => setRowAction(null)}
        records={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
      />

      <UpdateAccountFieldDialog
        open={rowAction?.variant === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        accountField={rowAction?.row.original || null}
      />
    </>
  )
}
