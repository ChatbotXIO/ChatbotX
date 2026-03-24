"use client"

import { FolderType } from "@aha.chat/database/enums"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Badge } from "@aha.chat/ui/components/ui/badge"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  CheckCircleIcon,
  FolderUpIcon,
  MoreHorizontalIcon,
  PauseCircleIcon,
  TextIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { use, useCallback, useMemo } from "react"
import { toast } from "sonner"
import type { listSequences } from "@/features/sequences/queries"
import { ChangeFolderDialog } from "../folders/change-folder"
import { updateSequenceAction } from "./actions/update-sequence.action"
import { DeleteSequenceDialog } from "./delete-sequence-dialog"
import { RenameSequenceDialog } from "./rename-sequence-dialog"
import type { ListSequencesItem } from "./schema"
import { SequencesTableToolbarActions } from "./sequences-table-toolbar-actions"

type SequencesTableProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof listSequences>>]>
}

export function SequencesTable({ chatbotId, promises }: SequencesTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<ListSequencesItem> | null>(null)

  const handleToggleStatus = useCallback(
    async (sequence: ListSequencesItem) => {
      try {
        await updateSequenceAction(chatbotId, sequence.id, {
          active: !sequence.active,
        })
        toast.success(
          t(sequence.active ? "sequences.deactivated" : "sequences.activated"),
        )
        router.refresh()
      } catch (_error) {
        toast.error(t("messages.unknownError"))
      }
    },
    [chatbotId, t, router],
  )

  const columns = useMemo<ColumnDef<ListSequencesItem>[]>(
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
          <div className="flex justify-start">
            <Link
              className="font-medium text-primary hover:underline"
              href={`/chatbots/${chatbotId}/sequences/${row.original.id}`}
            >
              {row.original.name ?? ""}
            </Link>
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
        accessorKey: "subscribers",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("sequences.subscribers")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">{row.original.subscribersCount}</div>
        ),
      },
      {
        accessorKey: "messages",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("sequences.step")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">{row.original.stepsCount}</div>
        ),
        size: 100,
        enableSorting: true,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            {row.original.active ? (
              <Badge variant="default">Active</Badge>
            ) : (
              <Badge variant="outline">Inactive</Badge>
            )}
          </div>
        ),
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
                  onClick={() => handleToggleStatus(row.original)}
                >
                  {row.original.active ? (
                    <>
                      <PauseCircleIcon className="mr-2" />
                      {t("actions.deactivate")}
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="mr-2" />
                      {t("actions.activate")}
                    </>
                  )}
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
    [t, chatbotId, handleToggleStatus],
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
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <SequencesTableToolbarActions
            chatbotId={chatbotId}
            setRowAction={setRowAction}
            table={table}
          />
        </DataTableToolbar>
      </DataTable>

      <RenameSequenceDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "update"}
        sequence={rowAction?.row.original || null}
      />

      <ChangeFolderDialog
        chatbotId={chatbotId}
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType={FolderType.sequence}
        modelIds={rowAction?.row.original ? [rowAction.row.original.id] : []}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
      />

      <DeleteSequenceDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "delete"}
        sequence={rowAction?.row.original || null}
      />
    </>
  )
}
