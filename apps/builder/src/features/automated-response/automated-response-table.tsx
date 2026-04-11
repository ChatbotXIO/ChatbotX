"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import {
  FolderUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import React, { use, useMemo } from "react"
import { toast } from "sonner"
import { useFlowStore } from "../flows/provider/flow-store-context"
import { ChangeFolderDialog } from "../folders/change-folder"
import { enableAutomatedResponseAction } from "./actions/enable-automated-response-action"
import { AddAutomatedResponseButton } from "./components/add-automated-response-button"
import { DeleteAutomatedResponsesDialog } from "./delete-automated-response-dialog"
import type { listAutomatedResponses } from "./queries"
import type { AutomatedResponseResource } from "./schema/resource"

type AutomatedResponseTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listAutomatedResponses>>]>
}

export function AutomatedResponsesTable({
  workspaceId,
  promises,
}: AutomatedResponseTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [{ data, pageCount }] = use(promises)
  const { flows: allFlows } = useFlowStore((state) => state)

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
        id: "keywords",
        accessorKey: "keywords",
        size: 100,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.keywords.label")}
          />
        ),
        cell: ({ row }) => {
          const { id, keywords } = row.original
          return (
            <div className="max-w-[200px] truncate">
              <Link
                className="truncate"
                href={`/space/${workspaceId}/automated-responses/${id}/edit?${searchParams.toString()}`}
                title={keywords.join(",")}
              >
                {keywords.join(",")}
              </Link>
            </div>
          )
        },
        meta: {
          label: t("fields.keywords.label"),
        },
        enableHiding: false,
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
        cell: ({ row }) => {
          let reply = row.original.text
          if (!reply) {
            const flow = allFlows.find((f) => f.id === row.original.flowId)
            if (flow) {
              reply = `Flow: ${flow.name}`
            }
          }

          return <div className="max-w-[200px] truncate">{reply ?? ""}</div>
        },
        enableSorting: false,
        enableHiding: false,
        meta: {
          label: t("fields.botResponse.label"),
        },
      },
      {
        id: "status",
        accessorKey: "status",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ cell, row }) => (
          <AutomatedResponseStatusCell
            checked={cell.getValue<AutomatedResponseResource["status"]>()}
            id={row.original.id}
            workspaceId={workspaceId}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        meta: {
          label: t("fields.status.label"),
        },
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => (
          <div>{format(row.original.createdAt, "yyyy/MM/dd HH:mm")}</div>
        ),
        meta: {
          label: t("fields.createdAt.label"),
        },
        enableSorting: true,
        enableHiding: false,
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
              <DropdownMenuItem asChild>
                <Link
                  href={`/space/${workspaceId}/automated-responses/${row.original.id}/edit`}
                >
                  <PencilIcon />
                  {t("actions.edit")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, variant: "move" })}
              >
                <FolderUpIcon />
                {t("actions.move")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "delete" })}
                variant="destructive"
              >
                <Trash2Icon />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [workspaceId, t, allFlows, searchParams],
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
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("keywords.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <AddAutomatedResponseButton />
          </DataTableToolbar>
        </DataTable>

        <DeleteAutomatedResponsesDialog
          automatedResponses={
            rowAction?.row.original ? [rowAction?.row.original] : []
          }
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            router.refresh()
          }}
          open={rowAction?.variant === "delete"}
          showTrigger={false}
          workspaceId={workspaceId}
        />

        <ChangeFolderDialog
          currentFolderId={rowAction?.row.original?.folderId || null}
          folderType="automatedResponse"
          modelIds={
            rowAction?.row.original ? [rowAction?.row.original.id] : null
          }
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "move"}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}

const AutomatedResponseStatusCell = (props: {
  id: string
  workspaceId: string
  checked: boolean
}) => {
  const router = useRouter()

  const { execute, isPending } = useAction(
    enableAutomatedResponseAction.bind(null, props.workspaceId, props.id),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
      onSuccess: () => {
        router.refresh()
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
