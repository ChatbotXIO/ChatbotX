"use client"

import type { TemplateInstallationListItem } from "@chatbotx.io/business"
import type { TemplateInstallationStatus } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { InstallAutoUpdateCell } from "./install-auto-update-cell"
import { InstallProgressRefresher } from "./install-progress-refresher"
import {
  isUninstallInProgress,
  uninstallStateLabelKey,
} from "./uninstall-state"
import { UninstalledNotice } from "./uninstalled-notice"

type TemplateInstallsTableProps = {
  workspaceId: string
  installations: TemplateInstallationListItem[]
  /** An install is running somewhere in this workspace, on any page or filter. */
  hasActiveInstalls: boolean
  nextCursor: string | null
  /** The status filter the page was loaded with. */
  status: TemplateInstallationStatus | null
}

const ALL_STATUSES = "all"
const STATUS_ORDER: readonly TemplateInstallationStatus[] = [
  "pending",
  "installing",
  "completed",
  "partial",
  "failed",
]

const STATUS_VARIANTS: Record<
  TemplateInstallationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  installing: "default",
  completed: "outline",
  partial: "outline",
  failed: "destructive",
  uninstalled: "secondary",
}

const hasPendingWork = (
  installations: TemplateInstallationListItem[],
): boolean =>
  installations.some(
    (installation) =>
      installation.status === "pending" ||
      installation.status === "installing" ||
      installation.activeSync ||
      isUninstallInProgress(installation.uninstallState),
  )

export function TemplateInstallsTable({
  workspaceId,
  installations,
  hasActiveInstalls,
  nextCursor,
  status,
}: TemplateInstallsTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const installsHref = `/space/${workspaceId}/templates/installs`

  const columns = useMemo<ColumnDef<TemplateInstallationListItem>[]>(
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
          <Link
            className="block truncate font-medium hover:underline"
            href={`${installsHref}/${row.original.id}`}
          >
            {row.original.templateName}
          </Link>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "status",
        size: 220,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => {
          const status = row.original.status
          const stateLabelKey = uninstallStateLabelKey(
            row.original.uninstallState,
          )
          const labelKey = `fields.status.${status}` as const
          return (
            <div className="flex flex-col items-start gap-1">
              <span className="flex flex-wrap items-center gap-1">
                <Badge variant={STATUS_VARIANTS[status]}>
                  {t.has(labelKey) ? t(labelKey) : status}
                </Badge>
                {row.original.updateAvailable && status !== "uninstalled" ? (
                  <Badge>{t("templates.sync.updateAvailable")}</Badge>
                ) : null}
              </span>
              {stateLabelKey ? (
                <span className="text-muted-foreground text-xs">
                  {t(stateLabelKey)}
                </span>
              ) : null}
              {status === "uninstalled" && row.original.uninstallCounts ? (
                <UninstalledNotice
                  compact
                  counts={row.original.uninstallCounts}
                  uninstalledBy={row.original.uninstalledByKind}
                />
              ) : null}
            </div>
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
    [t, workspaceId, installsHref],
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

  const statusQuery = status ? `&status=${status}` : ""

  return (
    <>
      {hasActiveInstalls || hasPendingWork(installations) ? (
        <InstallProgressRefresher />
      ) : null}
      <div className="flex items-center gap-2">
        <Select
          items={[
            { label: t("templates.installs.allStatuses"), value: ALL_STATUSES },
            ...STATUS_ORDER.map((option) => ({
              label: t(`fields.status.${option}`),
              value: option,
            })),
          ]}
          onValueChange={(value) =>
            router.push(
              value === ALL_STATUSES
                ? installsHref
                : `${installsHref}?status=${value}`,
            )
          }
          value={status ?? ALL_STATUSES}
        >
          <SelectTrigger
            aria-label={t("templates.installs.statusFilter")}
            className="w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>
              {t("templates.installs.allStatuses")}
            </SelectItem>
            {STATUS_ORDER.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`fields.status.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable table={table} />
      <div className="flex justify-end gap-2">
        {nextCursor ? (
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`${installsHref}?cursor=${nextCursor}${statusQuery}`}
          >
            {t("actions.next")}
          </Link>
        ) : null}
      </div>
    </>
  )
}
