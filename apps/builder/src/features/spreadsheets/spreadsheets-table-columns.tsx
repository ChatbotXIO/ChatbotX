"use client"

import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { Button } from "@aha.chat/ui/components/ui/button"
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
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { EllipsisVerticalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import type { useTranslations } from "next-intl"
import type { Dispatch, SetStateAction } from "react"
import type { SpreadsheetResource } from "./schemas/resource"

type GetColumnsProps = {
  t: ReturnType<typeof useTranslations>
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<SpreadsheetResource> | null>
  >
}

export function getSpreadsheetColumns({
  t,
  setRowAction,
}: GetColumnsProps): ColumnDef<SpreadsheetResource>[] {
  return [
    {
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
      size: 300,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "link",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.url.label")} />
      ),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="max-w-[300px] truncate">
              <Link
                className="truncate"
                href={row.original.url}
                target="_black"
              >
                {row.original.url}
              </Link>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{row.original.url}</p>
          </TooltipContent>
        </Tooltip>
      ),
      size: 300,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "actions",
      header: t("actions.actions"),
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
              onSelect={() => setRowAction({ row, variant: "update" })}
            >
              <PencilIcon />
              {t("actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setRowAction({ row, variant: "delete" })}
            >
              <Trash2Icon className="text-destructive" />
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
