"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
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
import { format } from "date-fns"
import {
  CalendarIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import type { useTranslations } from "next-intl"
import type { Dispatch, SetStateAction } from "react"
import type { ExternalCalendarResource } from "../schemas/resource"

type Props = {
  t: ReturnType<typeof useTranslations>
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<ExternalCalendarResource> | null>
  >
}

export function getExternalCalendarColumns({
  t,
  setRowAction,
}: Props): ColumnDef<ExternalCalendarResource>[] {
  return [
    {
      id: "provider",
      accessorKey: "providerType",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("externalCalendars.fields.provider")}
        />
      ),
      cell: () => (
        <Badge variant="secondary">
          <CalendarIcon className="size-3" />
          {t("externalCalendars.providers.googleCalendar")}
        </Badge>
      ),
      enableSorting: false,
    },
    {
      id: "email",
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("externalCalendars.fields.email")}
        />
      ),
      cell: ({ row }) => (
        <span className="inline-block max-w-[260px] truncate">
          {row.original.email ?? t("externalCalendars.emptyEmail")}
        </span>
      ),
    },
    {
      id: "calendarId",
      accessorKey: "providerCalendarId",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("externalCalendars.fields.calendarId")}
        />
      ),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-block max-w-[320px] truncate font-medium">
                {row.original.providerCalendarId}
              </span>
            }
          />
          <TooltipContent>{row.original.providerCalendarId}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "connected",
      accessorKey: "connectedCount",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("externalCalendars.fields.connected")}
        />
      ),
      cell: ({ row }) => (
        <Badge
          variant={row.original.connectedCount > 0 ? "default" : "outline"}
        >
          {row.original.connectedCount}
        </Badge>
      ),
      size: 90,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("externalCalendars.fields.date")}
        />
      ),
      cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd HH:mm"),
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
              disabled={row.original.connectedCount > 0}
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
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
