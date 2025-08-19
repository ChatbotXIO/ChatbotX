"use client"

import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import type { LogResource } from "./schemas"

export function getAuditColumns(): ColumnDef<LogResource>[] {
  return [
    {
      accessorKey: "executorType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Admin" />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.user ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage
                  alt="userImage"
                  src={row.original.user.image || undefined}
                />
                <AvatarFallback>CN</AvatarFallback>
              </Avatar>
              {row.original.user.name}
            </div>
          ) : null}
        </div>
      ),
      size: 150,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "url",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Web page" />
      ),
      cell: () => <a href={"/error-logs"}>View</a>,
      size: 50,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "detail",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Data" />
      ),
      cell: ({ row }) => <div>{row.original.detail}</div>,
      size: 400,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "action",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Action" />
      ),
      cell: ({ row }) => <div>{row.original.action}</div>,
      size: 50,
      enableSorting: true,
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
