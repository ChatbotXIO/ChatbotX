"use client";

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Avatar } from "@/components/ui/avatar";
import { ChatbotMember} from "@prisma/client";
import { AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { ColumnDef } from "@tanstack/react-table";
import { Circle, CircleCheck, Mail } from "lucide-react";
import { AgentActionsDropdown } from "../agent-actions-dropdown";


export function getColumns(): ColumnDef<ChatbotMember>[] {
  const renderIcon = (
    condition: boolean,
    ActiveIcon: any,
    InactiveIcon: any,
  ) =>
    condition ? (
      <ActiveIcon className="inline-block" />
    ) : (
      <InactiveIcon className="inline-block" />
    );
  return [
    {
      accessorKey: "nameAndAvatar",
      header: ({ column }) => (
        <DataTableColumnHeader  column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const avatar = [row.original.user.image].filter((v) => !!v).join(" ");
        const fullName = [row.original.user.name].filter((v) => !!v).join(" ");

        return (
          <div className="flex items-center space-x-6">
            <Avatar className="w-10 h-10">
              <AvatarImage src={avatar} alt={fullName} />
              <AvatarFallback>
                {fullName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{fullName}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "contacts",
      header: ({ column }) => (
        <DataTableColumnHeader className="text-center" column={column} title="Contacts" />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">
            {renderIcon(row.original.enableContacts, CircleCheck, Circle)}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },

    {
      accessorKey: "analytics",
      header: ({ column }) => (
        <DataTableColumnHeader className="text-center" column={column} title="Analytics" />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">
            {renderIcon(row.original.enableAnalytics, CircleCheck, Circle)}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "flows",
      header: ({ column }) => (
        <DataTableColumnHeader className="text-center" column={column} title="Flows" />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">{renderIcon(row.original.enableFlows, CircleCheck, Circle)}</div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "settings",
      header: ({ column }) => (
        <DataTableColumnHeader className="text-center" column={column} title="Settings" />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">{renderIcon(row.original.isAdmin, CircleCheck, Circle)}</div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "notifications",
      header: ({ column }) => (
        <DataTableColumnHeader className="text-center" column={column} title="Notifications" />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-center">
           {row.original.enableEmailAndPhone ? <Mail className="inline-block" /> : "Disable"}

          </div>
        );
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
        const agent = row.original;
        const handleEditAgent = (agent: ChatbotMember) => {
          console.log(`Edit agent: ${agent.id}`);
        };
        const handleDeleteAgent = (agent: ChatbotMember) => {
          console.log(`Delete agent with ID: ${agent.id}`);
        };

        return (
          <div className="text-center">
            <AgentActionsDropdown
              onEdit={() => handleEditAgent(agent)}
              onDelete={() => handleDeleteAgent(agent)}
            />
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },

  ];
}
