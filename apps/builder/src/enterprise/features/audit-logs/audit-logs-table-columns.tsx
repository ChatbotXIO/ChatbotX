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
import { useUserAvatarUrl } from "@/lib/auth/avatar"
import type { AuditLogResource } from "./schemas"

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

export function getAuditColumns(): ColumnDef<AuditLogResource>[] {
  return [
    {
      accessorKey: "userId",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="User" />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.user ? (
            <AuditUserCell user={row.original.user} />
          ) : null}
        </div>
      ),
      size: 150,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "action",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Action" />
      ),
      cell: ({ row }) => <div>{row.original.action}</div>,
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "detail",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Data" />
      ),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="inline-block max-w-[300px] truncate">
                {row.original.detail}
              </div>
            }
          />
          <TooltipContent>
            <p>{row.original.detail}</p>
          </TooltipContent>
        </Tooltip>
      ),
      size: 400,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd HH:mm"),
      size: 100,
      enableSorting: true,
      enableHiding: false,
    },
  ]
}
