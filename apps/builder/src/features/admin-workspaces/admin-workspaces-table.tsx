"use client"

import { isSupportAccessEnabled } from "@chatbotx.io/business/workspace-member/predicates"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import type {
  ListAdminWorkspacesResponse,
  listAdminWorkspaces,
} from "./queries"

type AdminWorkspacesTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listAdminWorkspaces>>]>
}

function OwnerCell({
  row,
}: {
  row: ListAdminWorkspacesResponse["data"][number]
}) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{row.ownerName ?? "—"}</span>
      <span className="text-muted-foreground text-xs">{row.ownerEmail}</span>
    </div>
  )
}

export function AdminWorkspacesTable({ promises }: AdminWorkspacesTableProps) {
  const [{ data, pageCount }] = use(promises)
  const t = useTranslations()

  const columns = useMemo<
    ColumnDef<ListAdminWorkspacesResponse["data"][number]>[]
  >(
    () => [
      {
        id: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => row.original.name,
        meta: {
          label: t("fields.name.label"),
          placeholder: t("platformAdmin.workspaces.searchPlaceholder"),
          variant: "text",
          filterKey: "keyword",
        },
        enableColumnFilter: true,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "owner",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("platformAdmin.workspaces.owner")}
          />
        ),
        cell: ({ row }) => <OwnerCell row={row.original} />,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "tenant",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("platformAdmin.workspaces.tenant")}
          />
        ),
        cell: ({ row }) => row.original.tenantName ?? "—",
        enableSorting: false,
      },
      {
        id: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => format(row.original.createdAt, "PP"),
        enableSorting: false,
      },
      {
        id: "supportStatus",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("platformAdmin.workspaces.supportStatus")}
          />
        ),
        cell: ({ row }) => {
          const { supportAccessUntil } = row.original
          if (
            supportAccessUntil &&
            isSupportAccessEnabled({ supportAccessUntil })
          ) {
            return (
              <Badge variant="secondary">
                {t("platformAdmin.workspaces.supportEnabledUntil", {
                  time: format(supportAccessUntil, "PPp"),
                })}
              </Badge>
            )
          }

          return (
            <span className="text-muted-foreground">
              {t("platformAdmin.workspaces.supportOff")}
            </span>
          )
        },
        enableSorting: false,
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const { supportAccessUntil, id } = row.original
          if (
            !(
              supportAccessUntil &&
              isSupportAccessEnabled({ supportAccessUntil })
            )
          ) {
            return null
          }

          return (
            <Button
              render={<Link href={`/space/${id}`} />}
              size="sm"
              variant="outline"
            >
              {t("platformAdmin.workspaces.openAsSupport")}
            </Button>
          )
        },
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
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  )
}
