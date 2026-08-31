"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { getAIMcpServerColumns } from "./ai-mcp-servers-columns"
import { AIMcpServersCreate } from "./ai-mcp-servers-create"
import { AIMcpServersTableToolbarActions } from "./ai-mcp-servers-table-toolbar-actions"
import { DeleteAIMcpServerDialog } from "./delete-ai-mcp-server-dialog"
import type { listAIMcpServers } from "./queries"
import type { AIMcpServerResource } from "./schema/resource"

type AIMcpServersTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listAIMcpServers>>]>
}

export function AIMcpServersTable({
  workspaceId,
  promises,
}: AIMcpServersTableProps) {
  const [{ data, pageCount }] = use(promises)

  const t = useTranslations()
  const router = useRouter()
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AIMcpServerResource> | null>(null)

  const columns = useMemo(() => getAIMcpServerColumns({ t, setRowAction }), [t])

  const { table } = useDataTable({
    data,
    columns,
    pageCount: pageCount ?? 1,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("aiMcpServers.title")}
        </CardTitle>
        <CardDescription>{t("aiMcpServers.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <AIMcpServersTableToolbarActions
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <AIMcpServersCreate
          initialData={
            rowAction?.variant === "update" ? rowAction.row.original : undefined
          }
          mode="edit"
          onOpenChange={(open) => !open && setRowAction(null)}
          onSuccess={() => {
            router.refresh()
          }}
          open={rowAction?.variant === "update"}
          workspaceId={workspaceId}
        />

        <DeleteAIMcpServerDialog
          mcpServer={
            rowAction?.variant === "delete" ? rowAction.row.original : null
          }
          onOpenChange={(open) => !open && setRowAction(null)}
          onSuccess={() => {
            rowAction?.row.toggleSelected(false)
          }}
          open={rowAction?.variant === "delete"}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
