"use client"

import { DataTable } from "@/components/data-table"
import { DataTableColumnHeader } from "@/components/data-table-column-header"
import { DataTableToolbar } from "@/components/data-table-toolbar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { useDataTable } from "@/hooks/use-data-table"
import type { DataTableRowAction } from "@/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { format } from "date-fns"
import { MoreHorizontalIcon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import Link from "next/link"
import React, { useMemo, useState } from "react"
import { toast } from "sonner"
import { updateAutomatedResponseAction } from "./actions/update-automated-response-action"
import type { getAutomatedResponses } from "./queries"
import {
  ReplyType,
  type CreateAutomatedResponseRequest,
} from "./schemas/create-automated-responses-schema"
import type { AutomatedResponseResource } from "./schemas/get-automated-responses-schema"

interface AutomatedResponseTableProps {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getAutomatedResponses>>]>
}

export function AutomatedResponsesTable({
  promises,
}: AutomatedResponseTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const { t } = useTranslate()

  const [_, setRowAction] =
    React.useState<DataTableRowAction<AutomatedResponseResource> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo<ColumnDef<AutomatedResponseResource>[]>(
    () => [
      {
        id: "select",
        size: 32,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "userMessages",
        size: 100,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="User Message" />
        ),
        cell: ({ row }) => {
          const { id, chatbotId, userMessages } = row.original
          return (
            <Link href={`/chatbots/${chatbotId}/automated-responses/${id}`}>
              {userMessages.join(",")}
            </Link>
          )
        },
      },
      {
        id: "replies",
        accessorKey: "replies",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Bot Response" />
        ),
        cell: ({ cell }) => {
          const replies = cell.getValue<
            AutomatedResponseResource["replies"]
          >() as CreateAutomatedResponseRequest["replies"]
          const displayData = replies.map((reply, idx) => {
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
              <li key={idx}>
                {reply.type === ReplyType.MESSAGE
                  ? `Message: ${reply.message}`
                  : `Flow: ${reply.flowId}`}
              </li>
            )
          })
          return <ul className="list-disc">{displayData}</ul>
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "status",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ cell, row }) => {
          const [checked, setChecked] = useState(
            cell.getValue<AutomatedResponseResource["status"]>(),
          )
          const { execute, isPending } = useAction(
            updateAutomatedResponseAction.bind(
              null,
              row.original.chatbotId,
              row.original.id,
            ),
            {
              onError: ({ error }) => {
                error.serverError && toast.error(error.serverError)
                setChecked(!checked)
              },
            },
          )

          return (
            <Switch
              checked={checked}
              disabled={isPending}
              onCheckedChange={(value) => {
                setChecked(value)
                execute({ status: value })
              }}
            />
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => {
          return <div>{format(row.original.createdAt, "yyyy/MM/dd HH:mm")}</div>
        },
      },
      {
        id: "action",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => {
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setRowAction({ row, variant: "update" })}
                >
                  {t("common.updateBtn")}
                </DropdownMenuItem>

                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setRowAction({ row, variant: "delete" })}
                >
                  {t("common.deleteBtn")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
    </>
  )
}
