"use client"

import { DataTableColumnHeader } from "@/components/data-table-column-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { Contact, Log, User } from "@ahachat.ai/database/types"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"

type LogWithExecutorUser = Log & {
  executorUser?: User
  executorContact?: Contact
}

export function getAuditColumns(): ColumnDef<LogWithExecutorUser>[] {
  return [
    {
      accessorKey: "executorType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Admin" />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.executorType ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage
                  src={row.original.executorUser?.image || undefined}
                  alt="userImage"
                />
                <AvatarFallback>CN</AvatarFallback>
              </Avatar>
              {row.original.executorUser?.name}
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
