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
import { Separator } from "@aha.chat/ui/components/ui/separator"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  FingerprintIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TextIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { useCopyToClipboard } from "usehooks-ts"
import CustomFieldTypeLabel from "../custom-fields/components/custom-field-label"
import { AccountFieldToolbarActions } from "./account-field-table-toolbar"
import { DeleteAccountFieldsDialog } from "./delete-account-fields-dialog"
import type { listAccountFields } from "./queries"
import type { AccountFieldResource } from "./schemas/resource"
import { UpdateAccountFieldDialog } from "./update-account-field-dialog"

type FieldsTableProps = {
  chatbotId: string
  folderId: string | null
  promises: Promise<[Awaited<ReturnType<typeof listAccountFields>>]>
}

export function AccountFieldsTable({
  chatbotId,
  folderId,
  promises,
}: FieldsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const router = useRouter()

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AccountFieldResource> | null>(null)
  const [_, copyToClipboard] = useCopyToClipboard()
  const t = useTranslations()

  const columns = useMemo<ColumnDef<AccountFieldResource>[]>(
    () => [
      {
        id: "select",
        header: ({ table: innerTable }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              innerTable.getIsAllPageRowsSelected() ||
              (innerTable.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              innerTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
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
        cell: ({ row }) => (
          <CustomFieldTypeLabel
            customFieldType={row.original.customFieldType}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "value",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Value" />
        ),
        cell: ({ row }) => <div>{row.original.value}</div>,
        enableHiding: false,
        enableSorting: false,
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
                onClick={() => setRowAction({ row, variant: "update" })}
              >
                <PencilIcon />
                {t("actions.update")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => copyToClipboard(row.original.id)}
              >
                <FingerprintIcon />
                {t("actions.getID")}
              </DropdownMenuItem>
              <Separator className="my-1" />
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
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [copyToClipboard, t],
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
          <AccountFieldToolbarActions
            chatbotId={chatbotId}
            folderId={folderId}
            table={table}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteAccountFieldsDialog
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          rowAction?.row.toggleSelected(false)
          router.refresh()
        }}
        open={rowAction?.variant === "delete"}
        records={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
      />

      <UpdateAccountFieldDialog
        accountField={rowAction?.row.original || null}
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "update"}
      />
    </>
  )
}
