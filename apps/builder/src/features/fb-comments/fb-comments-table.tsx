"use client"

import { folderTypes } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  FolderUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TextIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { use, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { ChangeFolderDialog } from "../folders/change-folder"
import { updateFbCommentAction } from "./actions/update-fb-comment.action"
import { BulkDeleteFbCommentsDialog } from "./components/bulk-delete-fb-comments-dialog"
import { BulkMoveFolderDialog } from "./components/bulk-move-folder-dialog"
import { DeleteFbCommentDialog } from "./components/delete-fb-comment-dialog"
import { FbCommentScheduleDialog } from "./components/fb-comment-schedule-dialog"
import { RenameFbCommentDialog } from "./components/rename-fb-comment-dialog"
import type { listFbComments } from "./queries"
import type { ListFbCommentsResponse } from "./schema/action"

type FbCommentsTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listFbComments>>]>
}

export function FbCommentsTable({
  workspaceId,
  promises,
}: FbCommentsTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] = React.useState<DataTableRowAction<
    ListFbCommentsResponse["data"][number]
  > | null>(null)

  const [scheduleDialogItem, setScheduleDialogItem] = React.useState<
    ListFbCommentsResponse["data"][number] | null
  >(null)

  const handleToggleStatus = useCallback(
    async (item: ListFbCommentsResponse["data"][number]) => {
      if (!item.isActive) {
        setScheduleDialogItem(item)
        return
      }

      try {
        await updateFbCommentAction(workspaceId, item.id, {
          isActive: false,
        })
        toast.success(t("facebookCommentAutomation.deactivated"))
        router.refresh()
      } catch {
        toast.error(t("messages.unknownError"))
      }
    },
    [workspaceId, t, router],
  )

  const columns = useMemo<ColumnDef<ListFbCommentsResponse["data"][number]>[]>(
    () => [
      {
        id: "select",
        header: ({ table: dataTable }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              dataTable.getIsAllPageRowsSelected() ||
              (dataTable.getIsSomePageRowsSelected() && "indeterminate")
            }
            className="translate-y-0.5 cursor-pointer"
            onCheckedChange={(value) =>
              dataTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            className="translate-y-0.5 cursor-pointer"
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
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
          <div className="max-w-75 truncate">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  className="truncate"
                  href={`/space/${workspaceId}/fb-comments/${row.original.id}`}
                >
                  {row.original.name ?? ""}
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>{row.original.name}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.placeholder"),
          variant: "text",
        },
        size: 300,
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
            title={t("facebookCommentAutomation.replies")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">{row.original.repliesCount}</div>
        ),
        size: 100,
      },
      {
        id: "actions",
        header: () => (
          <div className="w-full text-center">{t("actions.actions")}</div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost">
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    router.push(
                      `/space/${workspaceId}/fb-comments/${row.original.id}`,
                    )
                  }
                >
                  <PencilIcon className="mr-2" />
                  {t("actions.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setRowAction({ row, variant: "update" })}
                >
                  <TextIcon className="mr-2" />
                  {t("actions.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setRowAction({ row, variant: "move" })}
                >
                  <FolderUpIcon className="mr-2" />
                  {t("actions.move")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="hover:bg-muted hover:text-destructive"
                  onClick={() => setRowAction({ row, variant: "delete" })}
                >
                  <Trash2Icon className="mr-2" />
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
    [t, workspaceId, handleToggleStatus, router],
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

  const selectedRows = table.getFilteredSelectedRowModel().rows

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <div className="flex items-center gap-2">
            {selectedRows.length > 0 ? (
              <>
                <BulkDeleteFbCommentsDialog
                  fbComments={selectedRows.map((row) => row.original)}
                  onOpenChange={() => setRowAction(null)}
                  onSuccess={() => {
                    table.toggleAllRowsSelected(false)
                    router.refresh()
                  }}
                />
                <BulkMoveFolderDialog
                  fbComments={selectedRows.map((row) => row.original)}
                  onOpenChange={() => setRowAction(null)}
                  onSuccess={() => {
                    table.toggleAllRowsSelected(false)
                    router.refresh()
                  }}
                  workspaceId={workspaceId}
                />
              </>
            ) : null}
            <Button asChild size="sm">
              <Link href={`/space/${workspaceId}/fb-comments/create`}>
                {t("facebookCommentAutomation.create")}
              </Link>
            </Button>
          </div>
        </DataTableToolbar>
      </DataTable>

      <RenameFbCommentDialog
        fbComment={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => router.refresh()}
        open={rowAction?.variant === "update"}
      />

      <ChangeFolderDialog
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType={folderTypes.enum.fbComment}
        modelIds={rowAction?.row.original ? [rowAction.row.original.id] : []}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
        workspaceId={workspaceId}
      />

      <DeleteFbCommentDialog
        fbComment={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => router.refresh()}
        open={rowAction?.variant === "delete"}
      />

      <FbCommentScheduleDialog
        fbComment={scheduleDialogItem}
        onOpenChange={() => setScheduleDialogItem(null)}
        onSuccess={() => router.refresh()}
        open={!!scheduleDialogItem}
      />
    </>
  )
}
