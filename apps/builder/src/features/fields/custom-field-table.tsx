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
import { Switch } from "@/components/ui/switch"
import { useDataTable } from "@/hooks/use-data-table"
import type { DataTableRowAction } from "@/types/data-table"
import { type Field, FieldType } from "@ahachat.ai/database/types"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon } from "lucide-react"
import { use, useMemo, useState } from "react"
import { DeleteFieldsDialog } from "./delete-fields-dialog"
import type { listCustomFields } from "./queries"
import type { CustomFieldResource } from "./schemas/types"
import { UpdateCustomFieldDialog } from "./update-custom-field-dialog"
import { CustomFieldsTableToolbarActions } from "./custom-field-table-toolbar-actions"

interface FieldsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof listCustomFields>>]>
  chatbotId: string
}

export function CustomFieldsTable({ promises, chatbotId }: FieldsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] = useState<DataTableRowAction<Field> | null>(
    null,
  )
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
                <Button variant="ghost" size="icon">
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
            table={table}
            chatbotId={chatbotId}
            // setRowAction={setRowAction}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteFieldsDialog
        open={rowAction?.variant === "delete"}
        onOpenChange={() => setRowAction(null)}
        records={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
        fieldType={FieldType.CUSTOM_FIELD}
      />

      <UpdateCustomFieldDialog
        open={rowAction?.variant === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        customField={rowAction?.row.original || null}
      />
    </>
  )
}
