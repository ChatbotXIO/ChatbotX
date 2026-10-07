"use client"

import type { FlowJson } from "@chatbotx.io/mini-app"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  BracesIcon,
  InboxIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useEffect, useMemo, useState } from "react"
import { useClipboard } from "@/hooks/use-clipboard"
import { getMiniAppFlowJsonAction } from "./actions/get-mini-app-flow-json.action"
import { FlowJsonDialog } from "./components/flow-json-dialog"
import { PublishWhatsappDialog } from "./components/publish-whatsapp-dialog"
import { DeleteMiniAppsDialog } from "./delete-mini-apps"
import { buildMiniAppPublicUrl } from "./lib/public-url"
import type { listMiniApps, WhatsappPublishTarget } from "./queries"

type ListMiniAppsResponse = Awaited<ReturnType<typeof listMiniApps>>
export type MiniAppListItem = ListMiniAppsResponse["data"][number]

type MiniAppsTableProps = {
  workspaceId: string
  promises: Promise<[ListMiniAppsResponse, WhatsappPublishTarget[]]>
}

function FlowJsonLoader({
  workspaceId,
  miniAppId,
  onClose,
}: {
  workspaceId: string
  miniAppId: string
  onClose: () => void
}) {
  const [flowJson, setFlowJson] = useState<FlowJson | null>(null)
  const { execute } = useAction(
    getMiniAppFlowJsonAction.bind(null, workspaceId, miniAppId),
    {
      onSuccess: ({ data }) =>
        setFlowJson((data?.flowJson as FlowJson) ?? null),
    },
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the dialog opens
  useEffect(() => {
    execute()
  }, [])
  return (
    <FlowJsonDialog
      flowJson={flowJson}
      onOpenChange={(open) => !open && onClose()}
      open
    />
  )
}

export function MiniAppsTable({ workspaceId, promises }: MiniAppsTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const { handleCopy } = useClipboard()
  const [{ data, pageCount }, publishTargets] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<MiniAppListItem> | null>(null)
  const editHref = (id: string) => `/space/${workspaceId}/mini-apps/${id}/edit`

  const columns = useMemo<ColumnDef<MiniAppListItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={table.getIsAllPageRowsSelected()}
            className="translate-y-0.5"
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("actions.selectRow")}
            checked={row.getIsSelected()}
            className="translate-y-0.5"
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 20,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "keyword",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <Link
            className="inline-block max-w-[260px] truncate font-medium hover:underline"
            href={editHref(row.original.id)}
          >
            {row.original.name}
          </Link>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableSorting: false,
      },
      {
        id: "whatsapp",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("miniApps.table.whatsapp")}
          />
        ),
        cell: ({ row }) => {
          const publications = row.original.publications
          if (publications.length === 0) {
            return (
              <span className="text-muted-foreground text-sm">
                {t("miniApps.table.notPublished")}
              </span>
            )
          }
          return (
            <div className="flex flex-wrap gap-1">
              {publications.map((publication) => {
                const label = publishTargets.find(
                  (target) => target.id === publication.integrationWhatsappId,
                )?.label
                return (
                  <Badge
                    key={publication.id}
                    variant={
                      publication.status === "PUBLISHED" ? "default" : "outline"
                    }
                  >
                    {label ?? publication.integrationWhatsappId} ·{" "}
                    {publication.status}
                  </Badge>
                )
              })}
            </div>
          )
        },
        enableSorting: false,
      },
      {
        id: "submissionsCount",
        accessorKey: "submissionsCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("miniApps.table.submissions")}
          />
        ),
        cell: ({ row }) => (
          <Link
            className="hover:underline"
            href={`/space/${workspaceId}/mini-apps/${row.original.id}/submissions`}
          >
            {row.original.submissionsCount}
          </Link>
        ),
        enableSorting: false,
      },
      {
        id: "action",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={t("actions.openMenu")}
                  size="icon"
                  variant="ghost"
                >
                  <MoreHorizontalIcon className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => router.push(editHref(row.original.id))}
              >
                <PencilIcon />
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "copyJson" })}
              >
                <BracesIcon />
                {t("miniApps.table.copyJson")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handleCopy(buildMiniAppPublicUrl(row.original.id))
                }
              >
                <LinkIcon />
                {t("actions.copyUrl")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "publish" })}
              >
                <SendIcon />
                {t("miniApps.publish.open")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/space/${workspaceId}/mini-apps/${row.original.id}/submissions`,
                  )
                }
              >
                <InboxIcon />
                {t("miniApps.submissions.title")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
    // biome-ignore lint/correctness/useExhaustiveDependencies: editHref only depends on workspaceId
    [t, router, workspaceId, handleCopy, publishTargets, editHref],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["action"] },
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })
  const selected = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("miniApps.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <div className="flex items-center gap-2">
              {selected.length > 0 ? (
                <DeleteMiniAppsDialog
                  miniApps={selected}
                  onSuccess={() => table.toggleAllRowsSelected(false)}
                  workspaceId={workspaceId}
                />
              ) : null}
            </div>
            <Button
              render={<Link href={`/space/${workspaceId}/mini-apps/create`} />}
              size="sm"
            >
              <PlusIcon className="size-4" />
              {t("actions.create")}
            </Button>
          </DataTableToolbar>
        </DataTable>

        {rowAction?.variant === "copyJson" ? (
          <FlowJsonLoader
            miniAppId={rowAction.row.original.id}
            onClose={() => setRowAction(null)}
            workspaceId={workspaceId}
          />
        ) : null}

        <PublishWhatsappDialog
          key={rowAction?.row.original.id ?? "none"}
          miniAppId={
            rowAction?.variant === "publish" ? rowAction.row.original.id : null
          }
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "publish"}
          targets={publishTargets}
          workspaceId={workspaceId}
        />

        <DeleteMiniAppsDialog
          miniApps={rowAction?.row.original ? [rowAction.row.original] : []}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "delete"}
          showTrigger={false}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
