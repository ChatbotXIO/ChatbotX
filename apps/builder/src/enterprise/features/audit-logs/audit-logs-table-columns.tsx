"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import type { useTranslations } from "next-intl"
import { useUserAvatarUrl } from "@/lib/auth/avatar"
import type { AuditLogResource } from "./schemas"

type TranslationFn = ReturnType<typeof useTranslations>

function AuditUserCell({
  user,
}: {
  user: NonNullable<AuditLogResource["user"]>
}) {
  const avatarUrl = useUserAvatarUrl(user.image)

  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-6">
        <AvatarImage alt="userImage" src={avatarUrl ?? ""} />
        <AvatarFallback>{user.name?.[0]}</AvatarFallback>
      </Avatar>
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="inline-block max-w-[200px] truncate">
              {user.name}
            </div>
          }
        />
        <TooltipContent>
          <p>{user.name}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function getAuditColumns(
  t: TranslationFn,
): ColumnDef<AuditLogResource>[] {
  return [
    {
      accessorKey: "userId",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("auditLogs.columns.user")}
        />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.user ? (
            <AuditUserCell user={row.original.user} />
          ) : null}
        </div>
      ),
      size: 160,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "detail",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("auditLogs.columns.detail")}
        />
      ),
      cell: ({ row }) => (
        <div className="whitespace-normal break-words">
          {row.original.detail}
        </div>
      ),
      size: 640,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "ipAddress",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("auditLogs.columns.ipAddress")}
        />
      ),
      cell: ({ row }) => {
        const ipAddress = row.original.ipAddress || "-"

        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="max-w-[300px] truncate font-mono text-xs">
                  {ipAddress}
                </div>
              }
            />
            <TooltipContent>
              <p>{ipAddress}</p>
            </TooltipContent>
          </Tooltip>
        )
      },
      size: 300,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("auditLogs.columns.date")}
        />
      ),
      cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd HH:mm"),
      size: 130,
      enableSorting: true,
      enableHiding: false,
    },
  ]
}
