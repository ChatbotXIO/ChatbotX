"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
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
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
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
import { BotFieldToolbarActions } from "./bot-field-table-toolbar"
import { DeleteBotFieldsDialog } from "./delete-bot-fields-dialog"
import type { BotFieldResource } from "./schemas/resource"
import { UpdateBotFieldDialog } from "./update-bot-field-dialog"

type FieldsTableProps = {
  workspaceId: string
  folderId: string | null
  promises: Promise<[{ data: BotFieldResource[]; pageCount: number }]>
}

export function BotFieldsTable({
  workspaceId,
  folderId,
  promises,
}: FieldsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const router = useRouter()

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<BotFieldResource> | null>(null)
  const [_, copyToClipboard] = useCopyToClipboard()
  const t = useTranslations()

  const columns = useMemo<ColumnDef<BotFieldResource>[]>(
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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[200px] truncate">{row.original.name}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.name}</p>
            </TooltipContent>
          </Tooltip>
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
        id: "description",
        accessorKey: "description",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Description" />
        ),
        cell: ({ row }) => (
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
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "type",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => (
          <CustomFieldTypeLabel type={row.original.type as CustomFieldType} />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "value",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Value" />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[200px] truncate">{row.original.value}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.value}</p>
            </TooltipContent>
          </Tooltip>
        ),
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
                {t("actions.edit")}
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
    <Card>
      <CardHeader className="flex items-center">
        <CardTitle className="flex-1 font-bold text-xl">
          {t("fields.botField.label")}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <BotFieldToolbarActions
              folderId={folderId}
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteBotFieldsDialog
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            rowAction?.row.toggleSelected(false)
            router.refresh()
          }}
          open={rowAction?.variant === "delete"}
          records={rowAction?.row.original ? [rowAction?.row.original] : []}
          showTrigger={false}
          workspaceId={workspaceId}
        />

        <UpdateBotFieldDialog
          botField={rowAction?.row.original || null}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            router.refresh()
          }}
          open={rowAction?.variant === "update"}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
