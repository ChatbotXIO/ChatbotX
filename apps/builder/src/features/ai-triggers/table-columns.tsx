"use client"

import type { AITriggerModel } from "@chatbotx.io/database/types"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { EllipsisVerticalIcon } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"

type GetColumnsProps = {
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<AITriggerModel> | null>
  >
}

export function getAITriggersColumns({
  setRowAction,
}: GetColumnsProps): ColumnDef<AITriggerModel>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Selecionar todos"
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
          aria-label="Selecionar linha"
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
        <DataTableColumnHeader column={column} title="Nome" />
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
      accessorKey: "modified",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Modificado" />
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
      header: "Ações",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Abrir menu"
              className="flex size-8 p-0 data-[state=open]:bg-muted"
              variant="ghost"
            >
              <EllipsisVerticalIcon aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "update" })}
            >
              Update
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "duplicate" })}
            >
              Duplicate
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "delete" })}
            >
              Delete
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
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
