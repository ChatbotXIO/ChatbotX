"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Button } from "@chatbotx.io/ui/components/ui/button"
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
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import type { useTranslations } from "next-intl"
import type { AIMcpServerResource } from "./schema/resource"

type GetAIMcpServerColumnsProps = {
  t: ReturnType<typeof useTranslations>
  setRowAction: (action: DataTableRowAction<AIMcpServerResource> | null) => void
}

export const getAIMcpServerColumns = ({
  t,
  setRowAction,
}: GetAIMcpServerColumnsProps): ColumnDef<AIMcpServerResource>[] => [
  {
    id: "select",
    header: ({ table: innerTable }) => (
      <Checkbox
        aria-label={t("actions.selectAll")}
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
        aria-label={t("actions.selectRow")}
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
      <DataTableColumnHeader column={column} title={t("fields.name.label")} />
    ),
    cell: ({ row }) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="max-w-[300px] truncate">{row.original.name}</div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{row.original.name}</p>
        </TooltipContent>
      </Tooltip>
    ),
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "url",
    accessorKey: "url",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t("fields.url.label")} />
    ),
    cell: ({ row }) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="max-w-[400px] truncate">{row.original.url}</div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{row.original.url}</p>
        </TooltipContent>
      </Tooltip>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "actions",
    header: t("actions.actions"),
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
            onClick={() => {
              setRowAction({ row, variant: "update" })
            }}
          >
            <PencilIcon className="mr-2 h-4 w-4" />
            {t("actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => {
              setRowAction({ row, variant: "delete" })
            }}
          >
            <Trash2Icon className="mr-2 h-4 w-4" />
            {t("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    size: 50,
    enableSorting: false,
    enableHiding: false,
  },
]
