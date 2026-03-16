"use client"

import type { FieldModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  FolderUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { ChangeFolderDialog } from "../folders/change-folder"
import CustomFieldTypeLabel from "./components/custom-field-label"
import { CreateCustomFieldDialog } from "./create-custom-field"
import { CustomFieldsTableToolbarActions } from "./custom-field-table-toolbar-actions"
import { DeleteFieldsDialog } from "./delete-fields-dialog"
import type { listCustomFieldsRSC } from "./queries"
import type { CustomFieldResource } from "./schemas/resource"
import { UpdateCustomFieldDialog } from "./update-custom-field-dialog"

type FieldsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listCustomFieldsRSC>>]>
  chatbotId: string
  folderId: string | null
}

export function CustomFieldsTable({
  promises,
  chatbotId,
  folderId,
}: FieldsTableProps) {
  const t = useTranslations()
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
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-[200px] truncate">
                  {row.original.name}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{row.original.name}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "description",
        accessorKey: "description",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.description.label")}
          />
        ),
        cell: ({ row }) => (
          <div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-[200px] truncate">
                  {row.original.description}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{row.original.description}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "Type",
        accessorKey: "type",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.type.label")}
          />
        ),
        cell: ({ row }) => <CustomFieldTypeLabel type={row.original.type} />,
        meta: {
          label: t("fields.type.label"),
        },
        size: 100,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "Inbox",
        accessorKey: "showInInbox",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.inbox.label")}
          />
        ),
        cell: ({ row }) => <Switch checked={row.original.showInInbox} />,
        enableSorting: false,
        enableHiding: false,
        meta: {
          label: t("fields.inbox.label"),
        },
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
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, variant: "move" })}
              >
                <FolderUpIcon />
                {t("actions.move")}
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
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("customFields.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <CustomFieldsTableToolbarActions
              chatbotId={chatbotId}
              table={table}
              // setRowAction={setRowAction}
            />
            <CreateCustomFieldDialog
              chatbotId={chatbotId}
              folderId={folderId}
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteFieldsDialog
          chatbotId={chatbotId}
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

        <ChangeFolderDialog
          chatbotId={chatbotId}
          currentFolderId={rowAction?.row.original?.folderId || null}
          folderType="customField"
          modelIds={
            rowAction?.row.original ? [rowAction?.row.original.id] : null
          }
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "move"}
        />
      </CardContent>
    </Card>
  )
}
