"use client"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { Avatar } from "@/components/ui/avatar"
import type { ChatbotMember } from "@prisma/client"
import { AvatarFallback, AvatarImage } from "@radix-ui/react-avatar"
import type { ColumnDef } from "@tanstack/react-table"
import { Circle, CircleCheck, Mail } from "lucide-react"
import { useState } from "react"
import { AgentActionsDropdown } from "../agent-actions-dropdown"
import type { ChatbotMemberWithUser } from "./get-agents-queries"

const renderIcon = (condition: boolean, ActiveIcon: any, InactiveIcon: any) =>
  condition ? (
    <ActiveIcon className="inline-block" />
  ) : (
    <InactiveIcon className="inline-block" />
  )

export function getColumns(
  t: (key: string) => string,
  onEdit: (agent: ChatbotMember) => void,
): ColumnDef<ChatbotMemberWithUser>[] {
  return [
    {
      accessorKey: "avatar",
      header: ({ column }) => (
        <div className="flex justify-center">
          <DataTableColumnHeader column={column} title="" />
        </div>
      ),
      cell: ({ row }) => {
        const fullName = [row.original.user.name].filter((v) => !!v).join(" ")
        return (
          <div className="flex justify-center">
            <Avatar className="text-center w-10 h-10">
              <AvatarImage
                src={row.original.user.image || undefined}
                alt={fullName}
              />
              <AvatarFallback>
                {fullName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "keyword",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="font-bold"
          column={column}
          title={t("common.name")}
        />
      ),
      cell: ({ row }) => {
        const fullName = [row.original.user.name].filter((v) => !!v).join(" ")
        return (
          <div className="flex items-center space-x-6">
            <span className="font-medium">{fullName}</span>
          </div>
        )
      },
      enableSorting: true,
    },
    {
      accessorKey: "enalbleContacts",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="text-center"
          column={column}
          title={t("common.contacts")}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">
            {renderIcon(row.original.enableContacts, CircleCheck, Circle)}
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
          className="text-center"
          column={column}
          title={t("common.analytics")}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">
            {renderIcon(row.original.enableAnalytics, CircleCheck, Circle)}
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
          className="text-center"
          column={column}
          title={t("common.flows")}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">
            {renderIcon(row.original.enableFlows, CircleCheck, Circle)}
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
          className="text-center"
          column={column}
          title={t("common.settings")}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">
            {renderIcon(row.original.isAdmin, CircleCheck, Circle)}
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
          className="text-center"
          column={column}
          title={t("common.notifications")}
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">
            {row.original.enableEmailAndPhone ? (
              <Mail className="inline-block" />
            ) : (
              "Disable"
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
        const agent = row.original

        return (
          <div className="text-center">
            <AgentActionsDropdown
              onEdit={() => onEdit(agent)}
              onDelete={() => console.log("delete")}
            />
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
