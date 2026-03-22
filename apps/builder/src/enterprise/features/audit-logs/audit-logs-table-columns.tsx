"use client"

import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import type { AuditLogResource } from "./schemas"

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
            <div className="flex items-center gap-2">
              <Avatar className="size-6">
                <AvatarImage
                  alt="userImage"
                  src={row.original.user.image || undefined}
                />
                <AvatarFallback>{row.original.user.name?.[0]}</AvatarFallback>
              </Avatar>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="max-w-[200px] truncate">
                    {row.original.user.name}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{row.original.user.name}</p>
                </TooltipContent>
              </Tooltip>
            </div>
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
          <TooltipTrigger asChild>
            <div className="max-w-[300px] truncate">{row.original.detail}</div>
          </TooltipTrigger>
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
