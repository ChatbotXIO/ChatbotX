"use client"

import type { AIAgentModel } from "@chatbotx.io/database/types"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
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
    | "botReplyDelay"
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
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="max-w-100 truncate">{row.original.name}</div>
            }
          />
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
          <DropdownMenuTrigger>
            <EllipsisVerticalIcon aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => setRowAction({ row, variant: "toggleDefault" })}
            >
              <BrainIcon className="me-2" />
              {row.original.isDefault
                ? t("actions.unsetDefaultAgent")
                : t("actions.setAsDefaultAgent")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setRowAction({ row, variant: "botReplyDelay" })}
            >
              <PencilIcon className="me-2" />
              {t("fields.smartResponseDelaySeconds.label")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setRowAction({ row, variant: "update" })}
            >
              <PencilIcon className="me-2" />
              {t("actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setRowAction({ row, variant: "delete" })}
            >
              <Trash2Icon className="me-2" />
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
