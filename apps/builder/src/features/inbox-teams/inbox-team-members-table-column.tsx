"use client";

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TeamMember } from "@ahachat.ai/database";
import { Row, type ColumnDef } from "@tanstack/react-table";
import { EllipsisIcon } from "lucide-react";

export interface DataTableRowAction<TData> {
  row: Row<TData>
  type: "update" | "delete"
}

interface GetColumnsProps {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<TeamMember> | null>
  >
}

type TeamMemberWithUser = TeamMember & {
  user?: any
};


export function getTeamMembersTableColumns({ setRowAction }: GetColumnsProps): ColumnDef<TeamMemberWithUser>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <div>
        <div className="flex items-center gap-2">
          <Avatar className="h-5 w-5">
            <AvatarImage src={row.original.user.image} alt="userImage" />
            <AvatarFallback>CN</AvatarFallback>
          </Avatar>
          {row.original.user.name}
        </div>
      </div>,
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Open menu"
                variant="ghost"
                className="flex size-8 p-0 data-[state=open]:bg-muted"
              >
                <EllipsisIcon className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, type: "delete" })}
              >
                Delete
                <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
