"use client"

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
import { errorLogProviderLabel } from "@chatbotx.io/utils/error-log"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { EllipsisIcon } from "lucide-react"
import type { useTranslations } from "next-intl"
import type { Dispatch, SetStateAction } from "react"
import { ContactNameCell } from "@/features/contacts/components/contact-name-cell"
import type { ErrorLogResource } from "./schemas"

type GetColumnsProps = {
  t: ReturnType<typeof useTranslations>
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<ErrorLogResource> | null>
  >
}

export function getColumns({
  t,
  setRowAction,
}: GetColumnsProps): ColumnDef<ErrorLogResource>[] {
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
      id: "action",
      accessorKey: "action",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.type.label")} />
      ),
      cell: ({ row }) => (
        <div>{errorLogProviderLabel(row.original.action)}</div>
      ),
      meta: {
        label: t("fields.type.label"),
        placeholder: t("fields.type.placeholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "detail",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.description.label")}
        />
      ),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="max-w-[400px] truncate">
                {row.original.detail}
              </div>
            }
          />
          <TooltipContent>
            <p>{row.original.detail}</p>
          </TooltipContent>
        </Tooltip>
      ),
      meta: {
        label: t("fields.description.label"),
      },
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "contact",
      accessorKey: "contact",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.contact.label")}
        />
      ),
      cell: ({ row }) => {
        const contact = row.original.contact
        if (!contact) {
          return null
        }
        return (
          <ContactNameCell
            contact={contact}
            conversationId={contact.conversation?.id}
            unknownContactLabel={t("errorLogs.unknownContact")}
            workspaceId={row.original.workspaceId}
          />
        )
      },
      meta: {
        label: t("fields.contact.label"),
      },
      size: 220,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.date.label")} />
      ),
      cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd HH:mm"),
      meta: {
        label: t("fields.date.label"),
      },
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "actions",
      header: () => t("actions.actions"),
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t("actions.openMenu")}
                className="flex size-8 p-0 data-[state=open]:bg-muted"
                variant="ghost"
              >
                <EllipsisIcon aria-hidden="true" className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => setRowAction({ row, variant: "delete" })}
            >
              {t("actions.delete")}
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
