"use client"

import { ReplyType } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontalIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import React, { useMemo } from "react"
import { toast } from "sonner"
import type { getFlows } from "../flows/queries"
import { updateAutomatedResponseAction } from "./actions/update-automated-response-action"
import { DeleteAutomatedResponsesDialog } from "./delete-automated-response-dialog"
import type { getAutomatedResponses } from "./queries"
import type { CreateAutomatedResponseRequest } from "./schemas/create-automated-responses-schema"
import type { AutomatedResponseResource } from "./schemas/types"

type AutomatedResponseTableProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getAutomatedResponses>>]>
  flowPromises: Promise<[Awaited<ReturnType<typeof getFlows>>]>
}

export function AutomatedResponsesTable({
  chatbotId,
  promises,
  flowPromises,
}: AutomatedResponseTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }] = React.use(promises)
  const [{ data: allFlows }] = React.use(flowPromises)

  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<AutomatedResponseResource> | null>(null)

  const columns = useMemo<ColumnDef<AutomatedResponseResource>[]>(
    () => [
      {
        id: "select",
        size: 32,
        header: ({ table: innerTable }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              innerTable.getIsAllPageRowsSelected() ||
              (innerTable.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              innerTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "userMessages",
        size: 100,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.userMessage.label")}
          />
        ),
        cell: ({ row }) => {
          const { id, userMessages } = row.original
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
          <DataTableColumnHeader
            column={column}
            title={t("fields.botResponse.label")}
          />
        ),
        cell: ({ cell }) => {
          const replies = cell.getValue<
            AutomatedResponseResource["replies"]
          >() as CreateAutomatedResponseRequest["replies"]

          const displayData: string[] = []
          for (const reply of replies) {
            if (reply.type === ReplyType.Message) {
              displayData.push(`Message: ${reply.message}`)
            } else {
              const flow = allFlows.find((f) => f.id === reply.flowId)
              displayData.push(`Flow: ${flow?.name}`)
            }
          }

          return (
            <ul className="list-disc">
              {displayData.map((reply, idx) => {
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: wip
                  <li key={idx}>{reply}</li>
                )
              })}
            </ul>
          )
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
        cell: ({ cell, row }) => (
          <AutomatedResponseStatusCell
            chatbotId={chatbotId}
            checked={cell.getValue<AutomatedResponseResource["status"]>()}
            id={row.original.id}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => (
          <div>{format(row.original.createdAt, "yyyy/MM/dd HH:mm")}</div>
        ),
      },
      {
        id: "action",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <MoreHorizontalIcon className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "update" })}
                variant="destructive"
              >
                {t("actions.update")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "delete" })}
                variant="destructive"
              >
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [chatbotId, t, allFlows],
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

      <DeleteAutomatedResponsesDialog
        automatedResponses={
          rowAction?.row.original ? [rowAction?.row.original] : []
        }
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
      />
    </>
  )
}

const AutomatedResponseStatusCell = (props: {
  id: string
  chatbotId: string
  checked: boolean
}) => {
  const { execute, isPending } = useAction(
    updateAutomatedResponseAction.bind(null, props.chatbotId, props.id),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Switch
      checked={props.checked}
      disabled={isPending}
      onCheckedChange={(value) => {
        execute({ status: value })
      }}
    />
  )
}
