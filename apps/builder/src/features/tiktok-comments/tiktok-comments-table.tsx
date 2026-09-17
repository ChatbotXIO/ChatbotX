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
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { use, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { buildCommentAutomationStatColumns } from "../shared/comment-automation/comment-automation-stat-columns"
import { DeleteCommentAutomationDialog } from "../shared/comment-automation/delete-comment-automation-dialog"
import { deleteTiktokCommentAction } from "./actions/delete-tiktok-comment.action"
import { updateTiktokCommentAction } from "./actions/update-tiktok-comment.action"
import type { listTiktokComments } from "./queries"
import type { ListTiktokCommentsResponse } from "./schema/action"

type TiktokCommentsTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listTiktokComments>>]>
}

export function TiktokCommentsTable({
  workspaceId,
  promises,
}: TiktokCommentsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const t = useTranslations()
  const router = useRouter()

  const [rowAction, setRowAction] = React.useState<DataTableRowAction<
    ListTiktokCommentsResponse["data"][number]
  > | null>(null)

  const handleToggleStatus = useCallback(
    async (item: ListTiktokCommentsResponse["data"][number]) => {
      try {
        const result = await updateTiktokCommentAction(workspaceId, item.id, {
          isActive: !item.isActive,
        })

        if (result?.serverError) {
          toast.error(result.serverError)
          return
        }

        router.refresh()
      } catch {
        toast.error(t("messages.unknownError"))
      }
    },
    [workspaceId, router, t],
  )

  const columns = useMemo<
    ColumnDef<ListTiktokCommentsResponse["data"][number]>[]
  >(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <Link
            className="font-medium hover:underline"
            href={`/space/${workspaceId}/tiktok-comments/${row.original.id}`}
          >
            {row.original.name}
          </Link>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.placeholder"),
          variant: "text",
        },
        enableSorting: true,
        enableColumnFilter: true,
      },
      {
        accessorKey: "isActive",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Switch
              checked={row.original.isActive}
              onCheckedChange={() => handleToggleStatus(row.original)}
            />
          </div>
        ),
        size: 100,
      },
      {
        accessorKey: "repliesCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("tiktokCommentAutomation.replies")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">{row.original.repliesCount}</div>
        ),
        size: 120,
      },
      // The same six delivery/miss columns the Facebook and Instagram tables
      // render — they read counters that live on the row, so nothing here is
      // channel-specific.
      ...buildCommentAutomationStatColumns<
        ListTiktokCommentsResponse["data"][number]
      >({ workspaceId, t }),
      {
        id: "actions",
        header: () => (
          <div className="w-full text-center">{t("actions.actions")}</div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="icon" variant="ghost">
                    <MoreHorizontalIcon className="h-4 w-4" />
                    <span className="sr-only">{t("actions.actions")}</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-auto">
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/space/${workspaceId}/tiktok-comments/${row.original.id}`,
                    )
                  }
                >
                  <PencilIcon className="me-2" />
                  {t("actions.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="hover:bg-muted hover:text-destructive"
                  onClick={() => setRowAction({ row, variant: "delete" })}
                >
                  <Trash2Icon className="me-2" />
                  {t("actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [handleToggleStatus, router, t, workspaceId],
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
    clearOnDefault: true,
    shallow: false,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("tiktokCommentAutomation.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <Button
              render={
                <Link href={`/space/${workspaceId}/tiktok-comments/create`}>
                  {t("tiktokCommentAutomation.create")}
                </Link>
              }
              size="sm"
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteCommentAutomationDialog
          action={deleteTiktokCommentAction.bind(
            null,
            rowAction?.row.original?.workspaceId ?? "",
            rowAction?.row.original?.id ?? "",
          )}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => router.refresh()}
          open={rowAction?.variant === "delete"}
          resource={
            rowAction?.row.original
              ? {
                  id: rowAction.row.original.id,
                  workspaceId: rowAction.row.original.workspaceId,
                }
              : null
          }
          translationNamespace="tiktokCommentAutomation"
        />
      </CardContent>
    </Card>
  )
}
