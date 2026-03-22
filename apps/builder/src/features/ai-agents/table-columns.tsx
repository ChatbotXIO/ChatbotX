"use client"

import type { AIAgentModel } from "@aha.chat/database/types"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { Badge } from "@aha.chat/ui/components/ui/badge"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import type { ColumnDef, Row } from "@tanstack/react-table"
import { format } from "date-fns"
import {
  BrainIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import type { useTranslations } from "next-intl"
import type { Dispatch, SetStateAction } from "react"

export type AIAgentDataTableRowAction<TData> = {
  row: Row<TData>
  variant:
    | "update"
    | "delete"
    | "duplicate"
    | "rename"
    | "resend"
    | "enable"
    | "toggleDefault"
}

type GetAIAgentsColumnsProps = {
  setRowAction: Dispatch<
    SetStateAction<AIAgentDataTableRowAction<AIAgentModel> | null>
  >
  t: ReturnType<typeof useTranslations>
}

export function getAIAgentsColumns({
  setRowAction,
  t,
}: GetAIAgentsColumnsProps): ColumnDef<AIAgentModel>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          className="translate-y-0.5"
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(Boolean(value))
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
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
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
      size: 300,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "isDefault",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="" />
      ),
      cell: ({ row }) =>
        row.original.isDefault && (
          <Badge className="cursor-pointer">{t("aiAgent.defaultAgent")}</Badge>
        ),
      size: 150,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "modified",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Modified" />
      ),
      cell: ({ row }) => (
        <div>
          {row?.original.updatedAt
            ? format(row?.original.updatedAt, "MM/dd/yyyy")
            : ""}
        </div>
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Open menu"
              className="flex size-8 p-0 data-[state=open]:bg-muted"
              variant="ghost"
            >
              <EllipsisVerticalIcon aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "toggleDefault" })}
            >
              <BrainIcon className="mr-2" />
              {row.original.isDefault
                ? t("actions.unsetDefaultAgent")
                : t("actions.setAsDefaultAgent")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "update" })}
            >
              <PencilIcon className="mr-2" />
              {t("actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setRowAction({ row, variant: "delete" })}
            >
              <Trash2Icon className="mr-2" />
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
}
