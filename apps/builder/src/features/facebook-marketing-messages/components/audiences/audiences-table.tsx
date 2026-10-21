"use client"

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
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useAudiences, useAudiencesLive } from "../../hooks/use-audiences"
import { useMarketingMessagesNameLookups } from "../../hooks/use-marketing-messages-name-lookups"
import {
  formatApproximateCount,
  resolveAudienceStatus,
} from "../../lib/audience-status"
import { CreateAudienceDialog } from "./create-audience-dialog"
import { DeleteAudienceDialog } from "./delete-audience-dialog"

type AudienceRow = NonNullable<ReturnType<typeof useAudiences>["data"]>[number]

const EMPTY_ROWS: AudienceRow[] = []

export function AudiencesTable({
  workspaceId,
  readOnly = false,
}: {
  workspaceId: string
  readOnly?: boolean
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [pendingDelete, setPendingDelete] = useState<AudienceRow | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // The "Upload more rows" action sets the target row the wizard appends to.
  const [uploadMoreFor, setUploadMoreFor] = useState<AudienceRow | null>(null)

  const audiences = useAudiences(workspaceId)
  // Disabled when the grant is expired: it can only fail, and the cells fall
  // back to "–" (spec D14).
  const live = useAudiencesLive(workspaceId, !readOnly)
  const { pageNameById, adAccountNameById } = useMarketingMessagesNameLookups(
    workspaceId,
    readOnly,
  )

  const columns = useMemo<ColumnDef<AudienceRow>[]>(() => {
    // Names, count and status resolve in `cell`, not accessors: they come from
    // async queries and TanStack caches accessor results per row.
    const statusCell = (row: AudienceRow) => {
      const liveStatus = live.data?.[row.customAudienceId]
      const view = resolveAudienceStatus({
        readyAt: row.readyAt,
        live: liveStatus,
      })
      return (
        <div className="flex flex-col gap-1">
          {view.kind === "ready" && (
            <Badge variant="default">
              {t("facebookMarketingMessages.audiences.status.ready")}
            </Badge>
          )}
          {view.kind === "missing" && (
            <Badge variant="destructive">
              {t("facebookMarketingMessages.audiences.status.missing")}
            </Badge>
          )}
          {view.kind === "delivery" && (
            <span className="text-sm">{view.description}</span>
          )}
          {view.kind === "unknown" && <span>–</span>}
          {liveStatus?.pageDisconnected && (
            <span className="text-muted-foreground text-xs">
              {t("facebookMarketingMessages.audiences.pageDisconnected")}
            </span>
          )}
        </div>
      )
    }

    const base: ColumnDef<AudienceRow>[] = [
      {
        accessorKey: "customAudienceId",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t(
              "facebookMarketingMessages.audiences.fields.customAudienceId",
            )}
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.customAudienceId}
          </span>
        ),
      },
      {
        accessorKey: "pageId",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.fields.page")}
          />
        ),
        cell: ({ row }) =>
          pageNameById.get(row.original.pageId) ?? row.original.pageId,
      },
      {
        accessorKey: "adAccountId",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.fields.adAccount")}
          />
        ),
        cell: ({ row }) =>
          adAccountNameById.get(row.original.adAccountId) ??
          row.original.adAccountId,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        id: "approximateCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t(
              "facebookMarketingMessages.audiences.fields.approximateCount",
            )}
          />
        ),
        cell: ({ row }) => {
          const liveStatus = live.data?.[row.original.customAudienceId]
          return formatApproximateCount(
            liveStatus?.lower,
            liveStatus?.upper,
            locale,
          )
        },
        enableSorting: false,
      },
      {
        id: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.audiences.fields.status")}
          />
        ),
        cell: ({ row }) => statusCell(row.original),
        enableSorting: false,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => row.original.createdAt.toLocaleDateString(),
      },
    ]

    if (readOnly) {
      return base
    }

    return [
      ...base,
      {
        id: "actions",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              onClick={() => setUploadMoreFor(row.original)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <UploadIcon className="size-4" />
              <span className="sr-only">
                {t("facebookMarketingMessages.audiences.uploadMore")}
              </span>
            </Button>
            <Button
              onClick={() => setPendingDelete(row.original)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-4" />
              <span className="sr-only">{t("actions.delete")}</span>
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ]
  }, [t, locale, readOnly, live.data, pageNameById, adAccountNameById])

  const { table } = useDataTable({
    data: audiences.data ?? EMPTY_ROWS,
    columns,
    // The list is unpaginated server-side, so -1 hands pagination to the table.
    pageCount: -1,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (row) => row.id,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("facebookMarketingMessages.audiences.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            {!readOnly && (
              <Button
                onClick={() => setCreateOpen(true)}
                size="sm"
                type="button"
              >
                <PlusIcon className="size-4" />
                {t("facebookMarketingMessages.audiences.create")}
              </Button>
            )}
          </DataTableToolbar>
        </DataTable>
        <DeleteAudienceDialog
          audience={pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          workspaceId={workspaceId}
        />
        <CreateAudienceDialog
          onOpenChange={(open) => {
            if (!open) {
              setCreateOpen(false)
              setUploadMoreFor(null)
            }
          }}
          open={createOpen || uploadMoreFor !== null}
          target={
            uploadMoreFor
              ? {
                  id: uploadMoreFor.id,
                  name: uploadMoreFor.name,
                  // Only displayed (read-only), so resolved names are intended.
                  adAccountId:
                    adAccountNameById.get(uploadMoreFor.adAccountId) ??
                    uploadMoreFor.adAccountId,
                  pageId:
                    pageNameById.get(uploadMoreFor.pageId) ??
                    uploadMoreFor.pageId,
                }
              : null
          }
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
