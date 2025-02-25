"use client"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import type { AutomatedResponse } from "@ahachat.ai/database"
import type { ColumnDef, Row } from "@tanstack/react-table"
import { T } from "@tolgee/react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { updateStatusAutomatedResponseAction } from "./actions/update-automated-response-action"
import {
  type AutomatedResponseReply,
  ReplyType,
} from "./schemas/create-automated-responses-schema"

export function getColumns(
  chatbotId: string,
  onDeleteRow: (row: Row<AutomatedResponse>) => void,
): ColumnDef<AutomatedResponse>[] {
  return [
    {
      id: "select",
      size: 20,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-0.5"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-0.5"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "keyword",
      size: 100,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="User Message" />
      ),
      cell: ({ row }) => {
        return (
          <Link
            href={`/chatbots/${chatbotId}/automated-responses/${row.original.id}`}
          >
            {row.original.keyword}
          </Link>
        )
      },
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "botResponse",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Bot Response" />
      ),
      cell: ({ row }) => {
        return JSON.parse((row.original as AutomatedResponse).replies as string)
          .map((reply: AutomatedResponseReply) => {
            return reply.type === ReplyType.Message
              ? reply.answer
              : reply.flowId
          })
          .join("\n_______")
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "status",
      size: 10,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="" />
      ),
      cell: ({ row }) => {
        const [checked, setChecked] = useState(row.original.status)
        return (
          <Switch
            checked={checked}
            onCheckedChange={(e) => {
              setChecked(e)
              updateStatusAutomatedResponseAction(row.id, { status: e })
                .then((_) => {
                  toast.success("Automated Response updated successfully")
                  setChecked(e)
                })
                .catch((error) => {
                  setChecked(!e)
                })
            }}
            id={`status:${row.original.id}`}
          />
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "action",
      size: 10,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="" />
      ),
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">...</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onDeleteRow(row)}>
                  <T keyName="automatedResponse.del" />
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
