"use client"

import { canProcessMissedComments } from "@chatbotx.io/database/partials"
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
import {
  HistoryIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { use, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { buildCommentAutomationStatColumns } from "../shared/comment-automation/comment-automation-stat-columns"
import { DeleteCommentAutomationDialog } from "../shared/comment-automation/delete-comment-automation-dialog"
import { MissedCommentsProcessingLabel } from "../shared/comment-automation/missed-comments-processing-label"
import { ProcessMissedCommentsDialog } from "../shared/comment-automation/process-missed-comments-dialog"
import { useMissedCommentsInProgress } from "../shared/comment-automation/use-missed-comments-in-progress"
import { deleteThreadsCommentAction } from "./actions/delete-threads-comment.action"
import { updateThreadsCommentAction } from "./actions/update-threads-comment.action"
import type { listThreadsComments } from "./queries"
import type { ListThreadsCommentsResponse } from "./schema/action"

type ThreadsCommentsTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listThreadsComments>>]>
}

export function ThreadsCommentsTable({
  workspaceId,
  promises,
}: ThreadsCommentsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const t = useTranslations()
  const router = useRouter()

  const [rowAction, setRowAction] = React.useState<DataTableRowAction<
    ListThreadsCommentsResponse["data"][number]
  > | null>(null)

  const [missedCommentsItem, setMissedCommentsItem] = React.useState<
    ListThreadsCommentsResponse["data"][number] | null
  >(null)

  const {
    inProgress: missedCommentsInProgress,
    refresh: refreshMissedCommentsInProgress,
  } = useMissedCommentsInProgress(
    workspaceId,
    data.map((automation) => automation.id),
  )

  const handleToggleStatus = useCallback(
    async (item: ListThreadsCommentsResponse["data"][number]) => {
      try {
        const result = await updateThreadsCommentAction(workspaceId, item.id, {
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
    ColumnDef<ListThreadsCommentsResponse["data"][number]>[]
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
          <div className="flex flex-col gap-0.5">
            <Link
              className="font-medium hover:underline"
              href={`/space/${workspaceId}/threads-comments/${row.original.id}`}
            >
              {row.original.name}
            </Link>
            {missedCommentsInProgress.has(row.original.id) ? (
              <MissedCommentsProcessingLabel />
            ) : null}
          </div>
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
            title={t("threadsCommentAutomation.replies")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">{row.original.repliesCount}</div>
        ),
        size: 120,
      },
      // Threads has no DM of any kind, so its counters measure the public
      // comment reply — the only reply it can send. Seen and Clicked are
      // dropped rather than shown empty: a comment reply has no read receipt
      // and carries no button, so they would read zero forever.
      ...buildCommentAutomationStatColumns<
        ListThreadsCommentsResponse["data"][number]
      >({ workspaceId, t, supportsPrivateReply: false }),
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
                      `/space/${workspaceId}/threads-comments/${row.original.id}`,
                    )
                  }
                >
                  <PencilIcon className="me-2" />
                  {t("actions.edit")}
                </DropdownMenuItem>
                {canProcessMissedComments(row.original.post) ? (
                  <DropdownMenuItem
                    disabled={missedCommentsInProgress.has(row.original.id)}
                    onClick={() => setMissedCommentsItem(row.original)}
                  >
                    <HistoryIcon className="me-2" />
                    {t("commentAutomationMissedComments.action")}
                  </DropdownMenuItem>
                ) : null}
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
    [handleToggleStatus, router, t, workspaceId, missedCommentsInProgress],
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
        <CardTitle>{t("threadsCommentAutomation.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <Button
              render={
                <Link href={`/space/${workspaceId}/threads-comments/create`}>
                  {t("threadsCommentAutomation.create")}
                </Link>
              }
              size="sm"
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteCommentAutomationDialog
          action={deleteThreadsCommentAction.bind(
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
          translationNamespace="threadsCommentAutomation"
        />

        <ProcessMissedCommentsDialog
          onOpenChange={() => setMissedCommentsItem(null)}
          onSuccess={() => {
            refreshMissedCommentsInProgress()
            router.refresh()
          }}
          resource={missedCommentsItem}
        />
      </CardContent>
    </Card>
  )
}
