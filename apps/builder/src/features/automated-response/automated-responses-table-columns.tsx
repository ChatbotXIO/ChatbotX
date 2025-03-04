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
import type { ColumnDef, Row } from "@tanstack/react-table"
import { T } from "@tolgee/react"
import Link from "next/link"
import type { AutomatedResponseResource } from "./schemas/get-automated-responses-schema"

export interface DataTableRowAction<TData> {
  row: Row<TData>
  type: "update" | "delete" | "rename"
}

interface GetColumnsProps {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<AutomatedResponseResource> | null>
  >
}

export function getColumns({
  setRowAction,
}: GetColumnsProps): ColumnDef<AutomatedResponseResource>[] {
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
            href={`/chatbots/${row.original.chatbotId}/automated-responses/${row.original.id}`}
          >
            {row.original.userMessages.join(",")}
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
      cell: () => {
        return "ok"
        // return JSON.parse((row.original as AutomatedResponse).replies as string)
        //   .map((reply: AutomatedResponseReply) => {
        //     return reply.type === ReplyType.Message
        //       ? reply.answer
        //       : reply.flowId
        //   })
        //   .join("\n_______")
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
      cell: () => {
        // const [checked, setChecked] = useState(row.original.status)
        return "ok"
        // <Switch
        //   checked={checked}
        //   onCheckedChange={(e) => {
        //     setChecked(e)
        //     updateStatusAutomatedResponseAction(row.id, { status: e })
        //       .then((_) => {
        //         toast.success("Automated Response updated successfully")
        //         setChecked(e)
        //       })
        //       .catch((error) => {
        //         setChecked(!e)
        //       })
        //   }}
        //   id={`status:${row.original.id}`}
        // />
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
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, type: "delete" })}
                >
                  <T keyName="common.deleteBtn" />
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
