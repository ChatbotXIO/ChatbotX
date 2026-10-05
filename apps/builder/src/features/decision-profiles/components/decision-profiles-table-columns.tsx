"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
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
import type { ColumnDef, Row } from "@tanstack/react-table"
import { EllipsisVerticalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import type { useTranslations } from "next-intl"
import type { Dispatch, SetStateAction } from "react"
import type { DecisionProfileListItem } from "../schema/resource"
import { DecisionProfileStatusSwitch } from "./decision-profile-status-switch"

export type DecisionProfileDataTableRowAction = {
  row: Row<DecisionProfileListItem>
  variant: "delete" | "update"
}

type Props = {
  setRowAction: Dispatch<
    SetStateAction<DecisionProfileDataTableRowAction | null>
  >
  t: ReturnType<typeof useTranslations>
  workspaceId: string
}

export function getDecisionProfileColumns({
  setRowAction,
  t,
  workspaceId,
}: Props): ColumnDef<DecisionProfileListItem>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label={t("actions.selectAll")}
          checked={table.getIsAllPageRowsSelected()}
          className="translate-y-0.5"
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(Boolean(value))
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={t("actions.selectRow")}
          checked={row.getIsSelected()}
          className="translate-y-0.5"
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        />
      ),
      size: 20,
      enableHiding: false,
      enableSorting: false,
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.name.label")} />
      ),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                className="inline-block max-w-80 truncate text-left font-medium"
                onClick={() => setRowAction({ row, variant: "update" })}
                type="button"
              >
                {row.original.name}
              </button>
            }
          />
          <TooltipContent>{row.original.name}</TooltipContent>
        </Tooltip>
      ),
      meta: {
        label: t("fields.name.label"),
        placeholder: t("fields.name.searchPlaceholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableHiding: false,
      enableSorting: true,
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("decision.status.label")}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Badge
            variant={
              row.original.status === "enabled" ? "default" : "secondary"
            }
          >
            {t(`decision.status.${row.original.status}`)}
          </Badge>
          <DecisionProfileStatusSwitch
            profile={row.original}
            workspaceId={workspaceId}
          />
        </div>
      ),
      enableHiding: false,
      enableSorting: true,
    },
    {
      id: "connection",
      accessorKey: "connectionName",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("decision.connection")}
        />
      ),
      cell: ({ row }) =>
        row.original.connectionName ?? t("decision.connectionUnavailable"),
      enableHiding: false,
      enableSorting: false,
    },
    {
      id: "actions",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("actions.actions")} />
      ),
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t("actions.openMenu")}
                className="size-8 p-0"
                variant="ghost"
              >
                <EllipsisVerticalIcon className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setRowAction({ row, variant: "update" })}
            >
              <PencilIcon />
              {t("actions.edit")}
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
      size: 90,
      enableHiding: false,
      enableSorting: false,
    },
  ]
}
