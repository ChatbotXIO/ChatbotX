"use client"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { Avatar } from "@/components/ui/avatar"
import { AvatarFallback, AvatarImage } from "@radix-ui/react-avatar"
import type { ColumnDef } from "@tanstack/react-table"
import { CircleCheckIcon, CircleXIcon, MailIcon, MailXIcon } from "lucide-react"
import type { ChatbotMemberWithUser } from "./schemas/add-chatbot-member-schema"

const activeIcon = (active: boolean) =>
  active ? (
    <CircleCheckIcon className="text-primary" size={16} />
  ) : (
    <CircleXIcon size={16} />
  )

interface GetColumnsProps {
  titles: Record<
    "name" | "contacts" | "analytics" | "flows" | "settings" | "notifications",
    string
  >
  // setRowAction: React.Dispatch<
  //   React.SetStateAction<DataTableRowAction<ChatbotMemberWithUser> | null>
  // >
}

export function getColumns({
  titles,
  // setRowAction,
}: GetColumnsProps): ColumnDef<ChatbotMemberWithUser>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={titles.name}
          suppressHydrationWarning
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-1">
            <Avatar className="justify-items-center w-5 h-5">
              <AvatarImage
                src={row.original.user.image ?? undefined}
                alt="avatar"
              />
              <AvatarFallback>
                {(row.original.user.name ?? "").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span>{row.original.user?.name} </span>
          </div>
        )
      },
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "enableContacts",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="justify-items-center"
          column={column}
          title={titles.contacts}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="justify-items-center">
            {activeIcon(row.original.enableContacts)}
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "enableAnalytics",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="justify-items-center"
          column={column}
          title={titles.analytics}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="justify-items-center">
            {activeIcon(row.original.enableAnalytics)}
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "enableFlows",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="justify-items-center"
          column={column}
          title={titles.flows}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="justify-items-center">
            {activeIcon(row.original.enableFlows)}
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "settings",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="justify-items-center"
          column={column}
          title={titles.settings}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="justify-items-center">
            {activeIcon(row.original.isAdmin)}
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "notifications",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="justify-items-center"
          column={column}
          title={titles.notifications}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="justify-items-center">
            {row.original.enableEmailAndPhone ? (
              <MailIcon className="text-primary" size={16} />
            ) : (
              <MailXIcon size={16} />
            )}
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "actions",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="" />
      ),
      cell: ({ row }) => {
        const _agent = row.original

        return (
          <div className="justify-items-center">
            {/* <AgentActionsDropdown
              onEdit={() => onEdit(agent)}
              onDelete={() => console.log("delete")}
            /> */}
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
