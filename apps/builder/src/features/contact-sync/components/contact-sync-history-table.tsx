"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { useContactSyncLabels } from "../hooks/use-contact-sync-labels"
import { contactSyncRunPath } from "../lib/routes"
import type { ContactSyncHistoryPage } from "../queries/list-contact-sync-history.queries"

type HistoryRun = ContactSyncHistoryPage["data"][number]

const DATE_TIME_FORMAT_OPTIONS = {
  dateStyle: "short",
  timeStyle: "short",
} as const

/** Counter columns: a source counter, summed over the run, and its title. */
const COUNTER_COLUMNS = [
  { counter: "createdCount", titleKey: "contactSync.history.columns.created" },
  { counter: "updatedCount", titleKey: "contactSync.history.columns.updated" },
  { counter: "skippedCount", titleKey: "contactSync.history.columns.skipped" },
  { counter: "failedCount", titleKey: "contactSync.history.columns.failed" },
] as const

type ItemCounter = (typeof COUNTER_COLUMNS)[number]["counter"]

/** One counter summed over the run's sources. */
const totalOf = (run: HistoryRun, counter: ItemCounter) =>
  run.items.reduce((total, item) => total + item[counter], 0)

function DateCell({ date }: { date: Date | null }) {
  const formatter = useFormatter()
  if (!date) {
    return <span className="text-muted-foreground">—</span>
  }
  return <span>{formatter.dateTime(date, DATE_TIME_FORMAT_OPTIONS)}</span>
}

function StatusCell({ status }: { status: HistoryRun["status"] }) {
  const labels = useContactSyncLabels()
  return <Badge variant="outline">{labels.status(status)}</Badge>
}

function CountCell({ value }: { value: number }) {
  return <span className="tabular-nums">{value}</span>
}

/** Every sync run of the workspace, newest first; a run opens its progress. */
export function ContactSyncHistoryTable({
  workspaceId,
  promise,
}: {
  workspaceId: string
  promise: Promise<ContactSyncHistoryPage>
}) {
  const t = useTranslations()
  const { data, total, pageCount } = use(promise)

  const columns = useMemo<ColumnDef<HistoryRun>[]>(
    () => [
      {
        id: "pages",
        size: 260,
        header: t("contactSync.history.columns.pages"),
        cell: ({ row }) => (
          <Link
            className="font-medium hover:underline"
            href={contactSyncRunPath(workspaceId, row.original.id)}
          >
            {row.original.items
              .map(
                (item) =>
                  item.sourceAccountName ?? t("contactSync.progress.source"),
              )
              .join(", ")}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        size: 140,
        header: t("fields.status.label"),
        cell: ({ row }) => <StatusCell status={row.original.status} />,
      },
      ...COUNTER_COLUMNS.map(
        ({ counter, titleKey }): ColumnDef<HistoryRun> => ({
          id: counter,
          size: 110,
          header: t(titleKey),
          cell: ({ row }) => (
            <CountCell value={totalOf(row.original, counter)} />
          ),
        }),
      ),
      {
        accessorKey: "createdAt",
        size: 160,
        header: t("fields.createdAt.label"),
        cell: ({ row }) => <DateCell date={row.original.createdAt} />,
      },
      {
        accessorKey: "finishedAt",
        size: 160,
        header: t("contactSync.history.columns.finishedAt"),
        cell: ({ row }) => <DateCell date={row.original.finishedAt} />,
      },
    ],
    [t, workspaceId],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  // Only a workspace with no run at all is empty; a page past the end keeps
  // the table so its pagination can lead back.
  if (total === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("contactSync.history.empty")}
      </p>
    )
  }

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  )
}
