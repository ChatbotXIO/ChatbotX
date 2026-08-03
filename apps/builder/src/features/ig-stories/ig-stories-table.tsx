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
import { BulkDeleteCommentAutomationsDialog } from "../shared/comment-automation/bulk-delete-comment-automations-dialog"
import { BulkMoveCommentAutomationFolderDialog } from "../shared/comment-automation/bulk-move-comment-automation-folder-dialog"
import { CommentAutomationScheduleDialog } from "../shared/comment-automation/comment-automation-schedule-dialog"
import { DeleteCommentAutomationDialog } from "../shared/comment-automation/delete-comment-automation-dialog"
import { RenameCommentAutomationDialog } from "../shared/comment-automation/rename-comment-automation-dialog"
import { deleteIgStoryAction } from "./actions/delete-ig-story.action"
import { updateIgStoryAction } from "./actions/update-ig-story.action"
import { SelectInstagramConnectionTypeDialog } from "./components/select-instagram-connection-type-dialog"
import type { listIgStories } from "./queries"
import type { ListIgStoriesResponse } from "./schema/action"

type IgStoriesTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIgStories>>]>
}

export function IgStoriesTable({ workspaceId, promises }: IgStoriesTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] = React.useState<DataTableRowAction<
    ListIgStoriesResponse["data"][number]
  > | null>(null)

  const [scheduleDialogItem, setScheduleDialogItem] = React.useState<
    ListIgStoriesResponse["data"][number] | null
  >(null)

  const [connectionTypeOpen, setConnectionTypeOpen] = React.useState(false)

  const handleToggleStatus = useCallback(
    async (item: ListIgStoriesResponse["data"][number]) => {
      if (!item.isActive) {
        setScheduleDialogItem(item)
        return
      }

      try {
        await updateIgStoryAction(workspaceId, item.id, {
          isActive: false,
        })
        toast.success(t("instagramStoryAutomation.deactivated"))
        router.refresh()
      } catch {
        toast.error(t("messages.unknownError"))
      }
    },
    [workspaceId, t, router],
  )

  const columns = useMemo<ColumnDef<ListIgStoriesResponse["data"][number]>[]>(
    () => [
      {
        id: "select",
        header: ({ table: dataTable }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={dataTable.getIsAllPageRowsSelected()}
            className="translate-y-0.5 cursor-pointer"
            indeterminate={dataTable.getIsSomePageRowsSelected()}
            onCheckedChange={(value) =>
              dataTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("actions.selectRow")}
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
              <TooltipTrigger
                render={(triggerProps) => (
                  <Link
                    {...triggerProps}
                    className="truncate"
                    href={`/space/${workspaceId}/ig-stories/${row.original.id}`}
                  >
                    {row.original.name ?? ""}
                  </Link>
                )}
              />
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
            title={t("instagramStoryAutomation.replies")}
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
              <DropdownMenuTrigger
                render={(triggerProps) => (
                  <Button {...triggerProps} size="icon" variant="ghost">
                    <MoreHorizontalIcon className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                )}
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/space/${workspaceId}/ig-stories/${row.original.id}`,
                    )
                  }
                >
                  <PencilIcon className="me-2" />
                  {t("actions.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "update" })}
                >
                  <TextIcon className="me-2" />
                  {t("actions.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "move" })}
                >
                  <FolderUpIcon className="me-2" />
                  {t("actions.move")}
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
                <BulkDeleteCommentAutomationsDialog
                  deleteAction={deleteIgStoryAction}
                  items={selectedRows.map((row) => row.original)}
                  onOpenChange={() => setRowAction(null)}
                  onSuccess={() => {
                    table.toggleAllRowsSelected(false)
                    router.refresh()
                  }}
                  translationNamespace="instagramStoryAutomation"
                />
                <BulkMoveCommentAutomationFolderDialog
                  folderType={folderTypes.enum.igStory}
                  items={selectedRows.map((row) => row.original)}
                  onOpenChange={() => setRowAction(null)}
                  onSuccess={() => {
                    table.toggleAllRowsSelected(false)
                    router.refresh()
                  }}
                  translationNamespace="instagramStoryAutomation"
                  workspaceId={workspaceId}
                />
              </>
            ) : null}
            <Button onClick={() => setConnectionTypeOpen(true)} size="sm">
              {t("instagramStoryAutomation.create")}
            </Button>
          </div>
        </DataTableToolbar>
      </DataTable>

      <SelectInstagramConnectionTypeDialog
        onOpenChange={setConnectionTypeOpen}
        open={connectionTypeOpen}
        workspaceId={workspaceId}
      />

      <RenameCommentAutomationDialog
        action={updateIgStoryAction.bind(
          null,
          rowAction?.row.original?.workspaceId ?? "",
          rowAction?.row.original?.id ?? "",
        )}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => router.refresh()}
        open={rowAction?.variant === "update"}
        resource={rowAction?.row.original || null}
        translationNamespace="instagramStoryAutomation"
      />

      <ChangeFolderDialog
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType={folderTypes.enum.igStory}
        modelIds={rowAction?.row.original ? [rowAction.row.original.id] : []}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
        workspaceId={workspaceId}
      />

      <DeleteCommentAutomationDialog
        action={deleteIgStoryAction.bind(
          null,
          rowAction?.row.original?.workspaceId ?? "",
          rowAction?.row.original?.id ?? "",
        )}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => router.refresh()}
        open={rowAction?.variant === "delete"}
        resource={rowAction?.row.original || null}
        translationNamespace="instagramStoryAutomation"
      />

      <CommentAutomationScheduleDialog
        action={updateIgStoryAction.bind(
          null,
          scheduleDialogItem?.workspaceId ?? "",
          scheduleDialogItem?.id ?? "",
        )}
        onOpenChange={() => setScheduleDialogItem(null)}
        onSuccess={() => router.refresh()}
        open={!!scheduleDialogItem}
        resource={scheduleDialogItem}
        translationNamespace="instagramStoryAutomation"
      />
    </>
  )
}
