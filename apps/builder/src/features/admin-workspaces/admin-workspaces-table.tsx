"use client"

import { isSupportAccessEnabled } from "@chatbotx.io/business"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontalIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import type { listAdminWorkspaces } from "./queries"
import type { ListAdminWorkspacesResponse } from "./schema/query"

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
  const router = useRouter()

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
          if (isSupportAccessEnabled({ supportAccessUntil })) {
            return (
              <Badge variant="secondary">
                {t("platformAdmin.workspaces.supportEnabledUntil", {
                  time: format(supportAccessUntil as Date, "PPp"),
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
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const canOpenAsSupport = isSupportAccessEnabled({
            supportAccessUntil: row.original.supportAccessUntil,
          })

          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="icon" variant="ghost">
                    <MoreHorizontalIcon className="h-4 w-4" />
                    <span className="sr-only">{t("actions.openMenu")}</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                {canOpenAsSupport && (
                  <DropdownMenuItem
                    onClick={() => router.push(`/space/${row.original.id}`)}
                  >
                    {t("platformAdmin.workspaces.openAsSupport")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
        enableHiding: false,
      },
    ],
    [t, router],
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
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  )
}
