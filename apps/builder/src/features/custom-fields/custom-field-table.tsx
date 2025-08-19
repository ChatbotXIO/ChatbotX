"use client"

import { type FieldModel, FieldType } from "@aha.chat/database/types"
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
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon } from "lucide-react"
import { use, useMemo, useState } from "react"
import { CustomFieldsTableToolbarActions } from "./custom-field-table-toolbar-actions"
import { DeleteFieldsDialog } from "./delete-fields-dialog"
import type { listCustomFields } from "./queries"
import type { CustomFieldResource } from "./schemas"
import { UpdateCustomFieldDialog } from "./update-custom-field-dialog"

type FieldsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listCustomFields>>]>
  chatbotId: string
}

export function CustomFieldsTable({ promises, chatbotId }: FieldsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<FieldModel> | null>(null)
  // const [_, copyFieldId] = useCopyToClipboard()

  // const handleCopy = (id: string) => {
  //   copyFieldId(id)
  //     .then(() => {
  //       toast.success("Copied to clipboard!")
  //     })
  //     .catch(() => {
  //       toast.error("Failed to copy!")
  //     })
  // }

  const columns = useMemo<ColumnDef<CustomFieldResource>[]>(
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
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <div>
            <div>{row.original.name}</div>
            <div className="text-gray-400">{row.original.description}</div>
          </div>
        ),
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: "customFieldType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => <div>{row.original.customFieldType}</div>,
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: "showInInbox",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Inbox" />
        ),
        cell: ({ row }) => <Switch checked={row.original.showInInbox} />,
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          return (
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
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "delete" })}
                  variant="destructive"
                >
                  Delete
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
          <CustomFieldsTableToolbarActions
            chatbotId={chatbotId}
            table={table}
            // setRowAction={setRowAction}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteFieldsDialog
        chatbotId={chatbotId}
        fieldType={FieldType.CUSTOM_FIELD}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        records={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
      />

      <UpdateCustomFieldDialog
        chatbotId={chatbotId}
        customField={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
      />
    </>
  )
}
