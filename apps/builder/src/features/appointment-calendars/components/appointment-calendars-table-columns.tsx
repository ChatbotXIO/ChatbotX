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
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  CopyPlusIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  TextIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import type { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { Dispatch, SetStateAction } from "react"
import { useTenantSettings } from "@/features/tenant"
import { useClipboard } from "@/hooks/use-clipboard"
import { updateAppointmentCalendarActiveAction } from "../actions/update-appointment-calendar-active.action"
import type { AppointmentCalendarListItem } from "../schemas/resource"

type Props = {
  t: ReturnType<typeof useTranslations>
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<AppointmentCalendarListItem> | null>
  >
}

function ActiveCell({
  row,
}: {
  row: { original: AppointmentCalendarListItem }
}) {
  const { execute, isPending } = useAction(
    updateAppointmentCalendarActiveAction.bind(
      null,
      row.original.workspaceId,
      row.original.id,
    ),
    {
      onSuccess: () => {
        row.original.active = !row.original.active
      },
    },
  )
  return (
    <Switch
      checked={row.original.active}
      disabled={isPending}
      onCheckedChange={(value) => execute({ active: value })}
    />
  )
}

function CopyCalendarLinkMenuItem({
  calendar,
  label,
}: {
  calendar: AppointmentCalendarListItem
  label: string
}) {
  const { appUrl } = useTenantSettings()
  const { handleCopy } = useClipboard()
  const url = `${appUrl}/booking/${calendar.publicLinkSlug}`

  return (
    <DropdownMenuItem onClick={() => handleCopy(url)}>
      <LinkIcon />
      {label}
    </DropdownMenuItem>
  )
}

export function getAppointmentCalendarColumns({
  t,
  setRowAction,
}: Props): ColumnDef<AppointmentCalendarListItem>[] {
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
          <TooltipTrigger
            render={
              <Link
                className="inline-block max-w-[320px] truncate font-medium"
                href={`/space/${row.original.workspaceId}/appointment-calendars/${row.original.id}/edit`}
              >
                {row.original.name}
              </Link>
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
      enableSorting: true,
    },
    {
      id: "active",
      accessorKey: "active",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.status.label")}
        />
      ),
      cell: ({ row }) => <ActiveCell row={row} />,
      size: 50,
      enableSorting: false,
      enableHiding: false,
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
            <CopyCalendarLinkMenuItem
              calendar={row.original}
              label={t("actions.copyUrl")}
            />
            <DropdownMenuItem
              onClick={() => setRowAction({ row, variant: "rename" })}
            >
              <TextIcon />
              {t("actions.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setRowAction({ row, variant: "duplicate" })}
            >
              <CopyPlusIcon />
              {t("actions.duplicate")}
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
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
