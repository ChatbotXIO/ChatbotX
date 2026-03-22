"use client"

import type { IntegrationWebchatModel } from "@aha.chat/database/types"
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
import { format } from "date-fns"
import { CodeIcon, ExternalLinkIcon, MoreHorizontalIcon } from "lucide-react"
import Link from "next/link"
import type { useTranslations } from "next-intl"
import { EmbedCodeDialog } from "../dialogs/embed-code-dialog"

type WebchatColumnsProps = {
  setRowAction: (
    action: DataTableRowAction<IntegrationWebchatModel> | null,
  ) => void
  t: ReturnType<typeof useTranslations>
}

export function getWebchatColumns({
  setRowAction,
  t,
}: WebchatColumnsProps): ColumnDef<IntegrationWebchatModel>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.name.label")} />
      ),
      cell: ({ row }) => {
        const webchat = row.original
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[300px] truncate">{webchat.name}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{webchat.name}</p>
            </TooltipContent>
          </Tooltip>
        )
      },
      enableHiding: false,
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.updatedAt.label")}
        />
      ),
      cell: ({ row }) => {
        const date = row.getValue("updatedAt") as Date
        return (
          <div className="text-sm">{format(date, "MM/dd/yyyy h:mm a")}</div>
        )
      },
      enableHiding: false,
    },
    // {
    //   accessorKey: "enable",
    //   header: ({ column }) => (
    //     <DataTableColumnHeader
    //       column={column}
    //       title={t("fields.enable.label")}
    //     />
    //   ),
    //   cell: ({ row }) => {
    //     const enable = row.getValue("enable") as boolean

    //     return (
    //       <Switch
    //         checked={enable}
    //         onChange={() => setRowAction({ row, variant: "enable" })}
    //       />
    //     )
    //   },
    // },
    {
      id: "actions",
      cell: ({ row }) => {
        const webchat = row.original

        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              aria-label={t("actions.openWebchat")}
              onClick={() => {
                // Open webchat in new tab
                const url = `/webchat?chatbotId=${webchat.chatbotId}&webchatId=${webchat.id}`
                window.open(url, "_blank")
              }}
              size="sm"
              variant="ghost"
            >
              <ExternalLinkIcon className="h-4 w-4" />
            </Button>
            <EmbedCodeDialog webchat={webchat}>
              <Button
                aria-label={t("actions.getEmbedCode")}
                size="sm"
                variant="ghost"
              >
                <CodeIcon className="h-4 w-4" />
              </Button>
            </EmbedCodeDialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("actions.openMenu")}
                  className="h-8 w-8 p-0"
                  variant="ghost"
                >
                  <MoreHorizontalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Button
                    asChild
                    className="w-full justify-start"
                    size="sm"
                    variant="ghost"
                  >
                    <Link
                      href={`/chatbots/${webchat.chatbotId}/webchats/${webchat.id}/edit`}
                    >
                      {t("actions.edit")}
                    </Link>
                  </Button>
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
                  {t("actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
