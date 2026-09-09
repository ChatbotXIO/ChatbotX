"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { cn } from "@chatbotx.io/ui/lib/utils"
import type { ColumnDef } from "@tanstack/react-table"
import { useFormatter, useTranslations } from "next-intl"
import { use, useMemo } from "react"
import {
  contactScanStatusCopy,
  contactScanStatusToneClassName,
} from "../lib/status-copy"
import type { listContactScanHistory } from "../queries/list-contact-scan-history.queries"
import type { ListContactScanHistoryItem } from "../schema/query"

type ContactScanHistoryTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listContactScanHistory>>]>
}

const DATE_TIME_FORMAT_OPTIONS = {
  dateStyle: "short",
  timeStyle: "short",
} as const

/** Row-level cap so a long provider error never blows out the column. */
const ERROR_PREVIEW_LENGTH = 80

function ContactScanHistoryDateCell({ date }: { date: Date | null }) {
  const formatter = useFormatter()
  if (!date) {
    return <span className="text-muted-foreground">—</span>
  }
  return <span>{formatter.dateTime(date, DATE_TIME_FORMAT_OPTIONS)}</span>
}

function ContactScanHistoryStatusCell({
  status,
}: {
  status: ListContactScanHistoryItem["status"]
}) {
  const t = useTranslations()
  const tone = contactScanStatusCopy[status].tone

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-medium text-xs",
        contactScanStatusToneClassName[tone],
      )}
    >
      {t(`contactScan.histories.status.${status}`)}
    </span>
  )
}

function ContactScanHistoryErrorCell({ error }: { error: string | null }) {
  if (!error) {
    return <span className="text-muted-foreground">—</span>
  }
  const truncated =
    error.length > ERROR_PREVIEW_LENGTH
      ? `${error.slice(0, ERROR_PREVIEW_LENGTH)}…`
      : error
  return (
    <span className="text-destructive" title={error}>
      {truncated}
    </span>
  )
}

export function ContactScanHistoryTable({
  promises,
}: ContactScanHistoryTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }] = use(promises)

  const columns = useMemo<ColumnDef<ListContactScanHistoryItem>[]>(
    () => [
      {
        accessorKey: "channel",
        size: 140,
        header: t("contactScan.histories.columns.channel"),
        cell: ({ row }) => t(`fields.${row.original.channel}.label`),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "scanFromAt",
        size: 160,
        header: t("contactScan.histories.columns.scanFrom"),
        cell: ({ row }) => (
          <ContactScanHistoryDateCell date={row.original.scanFromAt} />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "status",
        size: 140,
        header: t("fields.status.label"),
        cell: ({ row }) => (
          <ContactScanHistoryStatusCell status={row.original.status} />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "importedContactCount",
        size: 140,
        header: t("contactScan.histories.columns.importedContacts"),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.importedContactCount}
          </span>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "currentScan",
        size: 160,
        header: t("contactScan.histories.columns.scannedConversations"),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.currentScan}</span>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "createdAt",
        size: 160,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => (
          <ContactScanHistoryDateCell date={row.original.createdAt} />
        ),
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: "finishedAt",
        size: 160,
        header: t("contactScan.histories.columns.finishedAt"),
        cell: ({ row }) => (
          <ContactScanHistoryDateCell date={row.original.finishedAt} />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "currentError",
        size: 280,
        header: t("contactScan.histories.columns.error"),
        cell: ({ row }) => (
          <ContactScanHistoryErrorCell error={row.original.currentError} />
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("contactScan.histories.empty")}
      </p>
    )
  }

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  )
}
