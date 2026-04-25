"use client"

import type { AIFunctionModel } from "@chatbotx.io/database/types"
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
import { formatDate } from "@chatbotx.io/ui/lib/format"
import type { ColumnDef, Row } from "@tanstack/react-table"
import {
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import type { useTranslations } from "next-intl"

export type AIFunctionRowAction = {
  row: Row<AIFunctionModel>
  variant: "edit" | "duplicate" | "delete"
}

export const getAIFunctionsColumns = (
  t: ReturnType<typeof useTranslations>,
  setRowAction: (action: AIFunctionRowAction | null) => void,
): ColumnDef<AIFunctionModel>[] => [
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
      <DataTableColumnHeader column={column} title={t("fields.name.label")} />
    ),
    cell: ({ row }) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="max-w-[400px] truncate">{row.original.name}</div>
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
    id: "createdAt",
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t("fields.createdAt.label")}
      />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-medium">
          {formatDate(row.original.createdAt)}
        </span>
      </div>
    ),
    enableSorting: true,
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
              setRowAction({ row, variant: "edit" })
            }}
          >
            <PencilIcon className="mr-2 h-4 w-4" />
            {t("actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setRowAction({ row, variant: "duplicate" })
            }}
          >
            <CopyIcon className="mr-2 h-4 w-4" />
            {t("actions.duplicate")}
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
