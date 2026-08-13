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
import type { ColumnDef, Row } from "@tanstack/react-table"
import {
  BanIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import type { useTranslations } from "next-intl"
import type { Dispatch, SetStateAction } from "react"
import type { AppointmentManagementListItem } from "../schemas/resource"

export type AppointmentRowAction = {
  row: Row<AppointmentManagementListItem>
  variant: "cancel" | "delete"
}

type Props = {
  t: ReturnType<typeof useTranslations>
  setRowAction: Dispatch<SetStateAction<AppointmentRowAction | null>>
}

const statusLabelKey = {
  scheduled: "appointmentManagement.statuses.scheduled",
  cancelled: "appointmentManagement.statuses.cancelled",
} as const satisfies Record<
  AppointmentManagementListItem["status"],
  | "appointmentManagement.statuses.scheduled"
  | "appointmentManagement.statuses.cancelled"
>

function formatAppointmentDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date)
}

export function getAppointmentColumns({
  t,
  setRowAction,
}: Props): ColumnDef<AppointmentManagementListItem>[] {
  return [
    {
      id: "name",
      accessorKey: "contactName",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("appointmentManagement.fields.name")}
        />
      ),
      cell: ({ row }) => {
        const name =
          row.original.contactName ?? t("appointmentManagement.unknownContact")
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  className="inline-block max-w-[260px] truncate font-medium"
                  href={row.original.scheduleUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {name}
                </Link>
              }
            />
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        )
      },
      meta: {
        label: t("appointmentManagement.fields.name"),
        placeholder: t("appointmentManagement.searchPlaceholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: false,
    },
    {
      id: "date",
      accessorKey: "startAt",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("appointmentManagement.fields.date")}
        />
      ),
      cell: ({ row }) =>
        formatAppointmentDate(
          row.original.startAt,
          row.original.inviteeTimezone,
        ),
      enableSorting: false,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("appointmentManagement.fields.status")}
        />
      ),
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "cancelled" ? "destructive" : "secondary"
          }
        >
          {t(statusLabelKey[row.original.status])}
        </Badge>
      ),
      enableSorting: false,
    },
    {
      id: "calendar",
      accessorKey: "calendarName",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("appointmentManagement.fields.calendar")}
        />
      ),
      cell: ({ row }) => (
        <span className="inline-block max-w-[260px] truncate">
          {row.original.calendarName}
        </span>
      ),
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
              onClick={() =>
                window.open(row.original.scheduleUrl, "_blank", "noreferrer")
              }
            >
              <ExternalLinkIcon />
              {t("actions.view")}
            </DropdownMenuItem>
            {row.original.cancellable ? (
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "cancel" })}
              >
                <BanIcon />
                {t("actions.cancel")}
              </DropdownMenuItem>
            ) : null}
            {row.original.deletable ? (
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "delete" })}
                variant="destructive"
              >
                <Trash2Icon />
                {t("actions.delete")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      size: 90,
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
