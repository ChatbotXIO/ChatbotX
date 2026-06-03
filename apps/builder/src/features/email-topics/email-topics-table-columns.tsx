"use client"

import type { EmailTopicModel } from "@chatbotx.io/database/types"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  EllipsisVerticalIcon,
  FolderUpIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import type { useTranslations } from "next-intl"
import type { Dispatch, SetStateAction } from "react"

function toPercent(value: number, total: number): string {
  if (total <= 0) {
    return "0%"
  }
  return `${Math.min(100, Math.round((value / total) * 100))}%`
}

type GetColumnsProps = {
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<EmailTopicModel> | null>
  >
  t: ReturnType<typeof useTranslations>
}

export function getEmailTopicColumns({
  setRowAction,
  t,
}: GetColumnsProps): ColumnDef<EmailTopicModel>[] {
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
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.name.label")} />
      ),
      cell: ({ row }) => (
        <div className="max-w-[300px] truncate">{row.original.name}</div>
      ),
      size: 300,
      meta: {
        label: t("fields.name.label"),
        placeholder: t("fields.name.placeholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      id: "sendsTotal",
      accessorKey: "sendsTotal",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.emailTopicSent.label")}
        />
      ),
      cell: ({ row }) => <div>{row.original.sendsTotal}</div>,
      size: 80,
      enableSorting: true,
    },
    {
      id: "delivered",
      header: t("fields.emailTopicDelivered.label"),
      cell: ({ row }) => (
        <div>
          {toPercent(row.original.deliveredsTotal, row.original.sendsTotal)}
        </div>
      ),
      size: 100,
      enableSorting: false,
    },
    {
      id: "seen",
      header: t("fields.emailTopicSeen.label"),
      cell: ({ row }) => (
        <div>
          {toPercent(row.original.seensTotal, row.original.deliveredsTotal)}
        </div>
      ),
      size: 100,
      enableSorting: false,
    },
    {
      id: "clicked",
      header: t("fields.emailTopicClicked.label"),
      cell: ({ row }) => (
        <div>
          {toPercent(row.original.clicksTotal, row.original.deliveredsTotal)}
        </div>
      ),
      size: 100,
      enableSorting: false,
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
              onSelect={() => setRowAction({ row, variant: "update" })}
            >
              <PencilIcon />
              {t("actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setRowAction({ row, variant: "move" })}
            >
              <FolderUpIcon />
              {t("actions.move")}
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
