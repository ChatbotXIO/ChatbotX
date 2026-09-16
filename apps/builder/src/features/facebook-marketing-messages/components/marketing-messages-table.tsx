"use client"

import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { connectMarketingMessagesAction } from "../actions/connect.action"
import { toMajorUnits } from "../lib/currency"
import { DeleteMarketingMessageDialog } from "./delete-marketing-message-dialog"

/**
 * `currencyOffset` is the snapshot taken when the campaign was created, so a
 * historical row keeps rendering the amount it was actually charged even if
 * Meta ever changes the offset for that currency.
 */
function formatBudget(row: FacebookMarketingMessageModel): string {
  const major = toMajorUnits(row.budgetMinorUnits, row.currencyOffset)
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: row.currency,
    }).format(major)
  } catch {
    // An unknown currency code must not blank the whole table.
    return `${major} ${row.currency}`
  }
}

export function MarketingMessagesTable({
  workspaceId,
  rows,
  readOnly = false,
}: {
  workspaceId: string
  rows: FacebookMarketingMessageModel[]
  readOnly?: boolean
}) {
  const t = useTranslations()
  const [pendingDelete, setPendingDelete] =
    useState<FacebookMarketingMessageModel | null>(null)

  const { execute: reconnect, isPending: isReconnecting } = useAction(
    connectMarketingMessagesAction.bind(null, workspaceId),
    {
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
    },
  )

  // The row only stores `pageId`; the name lives on the Messenger integration.
  const pages = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesPagesAPI.queryOptions(
      { input: { workspaceId } },
    ),
  )
  const pageNameById = useMemo(
    () =>
      new Map(
        (pages.data?.pages ?? []).map((page) => [page.pageId, page.name]),
      ),
    [pages.data],
  )

  // Ad account names come from Meta, so this one needs a live grant — skip the
  // call entirely while the grant is expired (`readOnly`) instead of firing a
  // request that can only fail.
  const adAccounts = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesAdAccountsAPI.queryOptions(
      { input: { workspaceId }, enabled: !readOnly },
    ),
  )
  const adAccountNameById = useMemo(
    () =>
      new Map(
        (adAccounts.data?.accounts ?? []).map((account) => [
          account.id,
          account.name,
        ]),
      ),
    [adAccounts.data],
  )

  const columns = useMemo<ColumnDef<FacebookMarketingMessageModel>[]>(() => {
    const base: ColumnDef<FacebookMarketingMessageModel>[] = [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) =>
          readOnly ? (
            <span className="font-medium">{row.original.name}</span>
          ) : (
            <Link
              className="font-medium hover:underline"
              href={`/space/${workspaceId}/fb-marketing-messages/${row.original.id}`}
            >
              {row.original.name}
            </Link>
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
        // Resolved in `cell`, not in an accessor: the page names arrive from a
        // query AFTER the first render, and TanStack caches accessor results
        // per row (`row._valuesCache`) keyed on `data`, so an accessor would
        // freeze the pre-fetch fallback forever. Falls back to the raw id so a
        // page that is no longer connected still renders something.
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
        // Same async-resolution reason as the page column above.
        cell: ({ row }) =>
          adAccountNameById.get(row.original.adAccountId) ??
          row.original.adAccountId,
      },
      {
        id: "budget",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.fields.budget")}
          />
        ),
        cell: ({ row }) => formatBudget(row.original),
        enableSorting: false,
      },
      {
        accessorKey: "budgetType",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.fields.budgetType")}
          />
        ),
        cell: ({ row }) =>
          row.original.budgetType === "daily"
            ? t("facebookMarketingMessages.fields.daily")
            : t("facebookMarketingMessages.fields.lifetime"),
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
              nativeButton={false}
              render={
                <Link
                  href={`/space/${workspaceId}/fb-marketing-messages/${row.original.id}`}
                >
                  <PencilIcon className="size-4" />
                  <span className="sr-only">{t("actions.edit")}</span>
                </Link>
              }
              size="icon"
              variant="ghost"
            />
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
  }, [t, workspaceId, readOnly, pageNameById, adAccountNameById])

  const { table } = useDataTable({
    data: rows,
    columns,
    // The list is unpaginated server-side, so -1 hands pagination to the table.
    pageCount: -1,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("facebookMarketingMessages.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            {readOnly ? (
              <Button
                disabled={isReconnecting}
                onClick={() => reconnect()}
                size="sm"
                type="button"
              >
                <RefreshCwIcon className="size-4" />
                {t("facebookMarketingMessages.reconnect")}
              </Button>
            ) : (
              <Button
                nativeButton={false}
                render={
                  <Link
                    href={`/space/${workspaceId}/fb-marketing-messages/create`}
                  >
                    <PlusIcon className="size-4" />
                    {t("facebookMarketingMessages.create")}
                  </Link>
                }
                size="sm"
              />
            )}
          </DataTableToolbar>
        </DataTable>

        <DeleteMarketingMessageDialog
          onOpenChange={(next) => !next && setPendingDelete(null)}
          open={pendingDelete !== null}
          row={pendingDelete}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
