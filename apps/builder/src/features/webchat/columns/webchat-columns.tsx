"use client"

import type { IntegrationChatWidgetModel } from "@aha.chat/database/types"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { ExternalLinkIcon, MoreHorizontalIcon } from "lucide-react"

type WebchatColumnsProps = {
  setRowAction: (
    action: DataTableRowAction<IntegrationChatWidgetModel> | null,
  ) => void
}

export function getWebchatColumns({
  setRowAction,
}: WebchatColumnsProps): ColumnDef<IntegrationChatWidgetModel>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const webchat = row.original
        return <span className="font-medium">{webchat.name}</span>
      },
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Modified" />
      ),
      cell: ({ row }) => {
        const date = row.getValue("updatedAt") as Date
        return (
          <div className="text-sm">{format(date, "MM/dd/yyyy h:mm a")}</div>
        )
      },
    },
    {
      accessorKey: "enable",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Enable" />
      ),
      cell: ({ row }) => {
        const enable = row.getValue("enable") as boolean
        return <Switch checked={enable} />
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const webchat = row.original

        return (
          <div className="flex items-center gap-2">
            <Button
              aria-label="Open webchat"
              onClick={() => {
                // Open webchat in new tab
                const url = `/webchat?chatbotId=${webchat.chatbotId}&widgetId=${webchat.id}`
                window.open(url, "_blank")
              }}
              size="sm"
              variant="ghost"
            >
              <ExternalLinkIcon className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Open menu"
                  className="h-8 w-8 p-0"
                  variant="ghost"
                >
                  <MoreHorizontalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    setRowAction({
                      row,
                      variant: "update",
                    })
                  }
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() =>
                    setRowAction({
                      row,
                      variant: "delete",
                    })
                  }
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
