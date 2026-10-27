"use client"

import type { PipelineListEntryWithPermissions } from "@chatbotx.io/business/pipeline"
import { pipelineTypes } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableSkeleton } from "@chatbotx.io/ui/components/data-table/data-table-skeleton"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import {
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SquareKanbanIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useQueryStates } from "nuqs"
import { useMemo, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { orpc } from "@/lib/orpc/query"
import {
  deletePipelineAction,
  duplicatePipelineAction,
  updatePipelineAction,
} from "../../actions/pipeline.action"
import { pipelineTypeKeys } from "../../lib/item-noun"
import {
  filterPipelineList,
  listSearchParsers,
  paginateList,
} from "../../lib/search-params"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import { CreatePipelineDialog } from "./create-pipeline-dialog"
import { PipelineNameDialog } from "./pipeline-name-dialog"

type DialogState =
  | { kind: "create" }
  | { kind: "rename"; id: string; name: string }
  | { kind: "delete"; id: string; name: string }
  | null

type PipelineRow = PipelineListEntryWithPermissions

export function PipelinesList({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const format = useFormatter()
  const [dialog, setDialog] = useState<DialogState>(null)
  const { data, isPending, isError, refetch } = useQuery(
    orpc.pipelinesAPI.privateListPipelinesAPI.queryOptions({
      input: { workspaceId },
    }),
  )
  const duplicate = useAction(
    duplicatePipelineAction.bind(null, workspaceId),
    usePipelineAction({ successMessage: "duplicate.success" }),
  )

  const columns = useMemo<ColumnDef<PipelineRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.pipeline.name,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <Link
            className="inline-block max-w-[320px] truncate font-medium hover:underline"
            href={`/space/${workspaceId}/pipelines/${row.original.pipeline.id}`}
          >
            {row.original.pipeline.name}
          </Link>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "type",
        accessorFn: (row) => row.pipeline.type,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("pipelines.list.type")}
          />
        ),
        cell: ({ row }) =>
          t(`pipelines.${pipelineTypeKeys[row.original.pipeline.type].label}`),
        meta: {
          label: t("pipelines.list.type"),
          variant: "multiSelect",
          options: pipelineTypes.options.map((type) => ({
            label: t(`pipelines.${pipelineTypeKeys[type].label}`),
            value: type,
          })),
        },
        enableColumnFilter: true,
        enableSorting: false,
      },
      {
        id: "itemsCount",
        accessorKey: "itemsCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("pipelines.list.contacts")}
          />
        ),
        cell: ({ row }) => format.number(row.original.itemsCount),
        enableSorting: false,
      },
      {
        id: "createdAt",
        accessorFn: (row) => row.pipeline.createdAt,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) =>
          format.dateTime(new Date(row.original.pipeline.createdAt), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        enableSorting: false,
      },
      {
        id: "action",
        size: 10,
        header: () => null,
        cell: ({ row }) => {
          const { pipeline, permissions } = row.original
          if (!(permissions.canManageSettings || permissions.canDelete)) {
            return null
          }
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="icon" type="button" variant="ghost">
                    <MoreHorizontalIcon className="size-4" />
                    <span className="sr-only">{t("actions.openMenu")}</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                {permissions.canManageSettings ? (
                  <>
                    <DropdownMenuItem
                      onClick={() =>
                        setDialog({
                          kind: "rename",
                          id: pipeline.id,
                          name: pipeline.name,
                        })
                      }
                    >
                      <PencilIcon />
                      {t("actions.rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={duplicate.isPending}
                      onClick={() => duplicate.execute({ id: pipeline.id })}
                    >
                      <CopyIcon />
                      {t("actions.duplicate")}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {permissions.canDelete ? (
                  <DropdownMenuItem
                    onClick={() =>
                      setDialog({
                        kind: "delete",
                        id: pipeline.id,
                        name: pipeline.name,
                      })
                    }
                    variant="destructive"
                  >
                    <Trash2Icon />
                    {t("actions.delete")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, format, workspaceId, duplicate],
  )

  const [{ name, type, page, perPage }] = useQueryStates(listSearchParsers)
  // The list is fully loaded and cached per workspace, so filters and pages
  // apply in memory to the same URL state the toolbar and pager write.
  const visible = useMemo(() => {
    const filtered = filterPipelineList(data ?? [], { name, type })
    return paginateList(filtered, page, perPage)
  }, [data, name, type, page, perPage])

  const { table } = useDataTable({
    data: visible.rows,
    columns,
    pageCount: visible.pageCount,
    initialState: { columnPinning: { right: ["action"] } },
    getRowId: (row) => row.pipeline.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("pipelines.title")}
        </CardTitle>
        <CardDescription>{t("pipelines.list.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <DataTableSkeleton
            columnCount={5}
            data-testid="pipelines-loading"
            rowCount={3}
            withViewOptions={false}
          />
        ) : null}

        {isError ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border p-10 text-center">
            <p className="text-muted-foreground text-sm">
              {t("pipelines.list.error")}
            </p>
            <Button onClick={() => refetch()} size="sm" variant="outline">
              {t("pipelines.retry")}
            </Button>
          </div>
        ) : null}

        {data?.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
            <SquareKanbanIcon className="size-8 text-muted-foreground" />
            <p className="font-medium">{t("pipelines.list.empty")}</p>
            <p className="max-w-md text-muted-foreground text-sm">
              {t("pipelines.list.emptyHint")}
            </p>
            <Button onClick={() => setDialog({ kind: "create" })} size="sm">
              <PlusIcon />
              {t("pipelines.list.add")}
            </Button>
          </div>
        ) : null}

        {data && data.length > 0 ? (
          <DataTable table={table}>
            <DataTableToolbar table={table}>
              <Button onClick={() => setDialog({ kind: "create" })} size="sm">
                <PlusIcon />
                {t("pipelines.list.add")}
              </Button>
            </DataTableToolbar>
          </DataTable>
        ) : null}

        <CreatePipelineDialog
          onOpenChange={(open) => !open && setDialog(null)}
          open={dialog?.kind === "create"}
          workspaceId={workspaceId}
        />
        {dialog?.kind === "rename" ? (
          <RenamePipelineDialog
            dialog={dialog}
            key={dialog.id}
            onClose={() => setDialog(null)}
            workspaceId={workspaceId}
          />
        ) : null}
        {dialog?.kind === "delete" ? (
          <DeletePipelineDialog
            dialog={dialog}
            key={dialog.id}
            onClose={() => setDialog(null)}
            workspaceId={workspaceId}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

function RenamePipelineDialog({
  workspaceId,
  dialog,
  onClose,
}: {
  workspaceId: string
  dialog: { id: string; name: string }
  onClose: () => void
}) {
  const t = useTranslations("pipelines")
  const { execute, isPending } = useAction(
    updatePipelineAction.bind(null, workspaceId),
    usePipelineAction({ successMessage: "rename.success", onDone: onClose }),
  )

  return (
    <PipelineNameDialog
      initialName={dialog.name}
      isPending={isPending}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(name) => execute({ id: dialog.id, name })}
      open
      submitLabel={t("rename.submit")}
      title={t("rename.title")}
    />
  )
}

function DeletePipelineDialog({
  workspaceId,
  dialog,
  onClose,
}: {
  workspaceId: string
  dialog: { id: string; name: string }
  onClose: () => void
}) {
  const t = useTranslations("pipelines")
  const { execute, isPending } = useAction(
    deletePipelineAction.bind(null, workspaceId),
    usePipelineAction({ successMessage: "delete.success", onDone: onClose }),
  )

  return (
    <ConfirmDialog
      confirmLabel={t("menu.delete")}
      description={t("delete.description", { name: dialog.name })}
      destructive
      isPending={isPending}
      onConfirm={() => execute({ id: dialog.id })}
      onOpenChange={(open) => !open && onClose()}
      open
      title={t("delete.title")}
    />
  )
}
