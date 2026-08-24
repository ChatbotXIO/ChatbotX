"use client"

import type { TemplateInstallationStatus } from "@chatbotx.io/database/partials"
import type { TemplateInstallationModel } from "@chatbotx.io/database/types"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { InstallAutoUpdateCell } from "./install-auto-update-cell"
import { InstallProgressRefresher } from "./install-progress-refresher"

type TemplateInstallsTableProps = {
  workspaceId: string
  installations: TemplateInstallationModel[]
}

const STATUS_VARIANTS: Record<
  TemplateInstallationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  installing: "default",
  completed: "outline",
  partial: "outline",
  failed: "destructive",
}

const hasPendingWork = (installations: TemplateInstallationModel[]): boolean =>
  installations.some(
    (installation) =>
      installation.status === "pending" || installation.status === "installing",
  )

export function TemplateInstallsTable({
  workspaceId,
  installations,
}: TemplateInstallsTableProps) {
  const t = useTranslations()

  const columns = useMemo<ColumnDef<TemplateInstallationModel>[]>(
    () => [
      {
        accessorKey: "templateName",
        size: 260,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="truncate font-medium">
            {row.original.templateName}
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "status",
        size: 120,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => {
          const status = row.original.status
          const labelKey = `fields.status.${status}` as const
          return (
            <Badge variant={STATUS_VARIANTS[status]}>
              {t.has(labelKey) ? t(labelKey) : status}
            </Badge>
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "resourceCount",
        size: 120,
        header: t("templates.installs.resources"),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.resourceCount}</span>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "warningCount",
        size: 120,
        header: t("templates.installs.warnings"),
        cell: ({ row }) => {
          const { warningCount } = row.original
          if (warningCount === 0) {
            return <span className="tabular-nums">0</span>
          }
          // A completed-with-warnings install (status "partial") is not a
          // failure — amber, not red — mirroring
          // `import-history-table.tsx`'s warning-only treatment.
          return (
            <span className="text-amber-600 tabular-nums">{warningCount}</span>
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "createdAt",
        size: 150,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd HH:mm"),
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: "completedAt",
        size: 150,
        header: t("templates.installs.completedAt"),
        cell: ({ row }) =>
          row.original.completedAt
            ? format(row.original.completedAt, "yyyy/MM/dd HH:mm")
            : "—",
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "autoUpdate",
        size: 220,
        header: t("templates.installs.autoUpdate"),
        cell: ({ row }) => (
          <InstallAutoUpdateCell
            autoUpdate={row.original.autoUpdate}
            installationId={row.original.id}
            workspaceId={workspaceId}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, workspaceId],
  )

  const { table } = useDataTable({
    data: installations,
    columns,
    pageCount: 1,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      {hasPendingWork(installations) ? <InstallProgressRefresher /> : null}
      <DataTable table={table} />
    </>
  )
}
