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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import {
  type AIFunctionRowAction,
  getAIFunctionsColumns,
} from "./ai-functions-columns"
import { AIFunctionsCreate } from "./ai-functions-create"
import { AIFunctionsTableToolbarActions } from "./ai-functions-table-toolbar-actions"
import { DeleteAIFunctionDialog } from "./delete-ai-function-dialog"
import type { listAIFunctions } from "./queries"

type AIFunctionsTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listAIFunctions>>]>
}

export function AIFunctionsTable({
  workspaceId,
  promises,
}: AIFunctionsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const t = useTranslations()
  const router = useRouter()

  const [rowAction, setRowAction] = useState<AIFunctionRowAction | null>(null)

  const columns = useMemo(() => getAIFunctionsColumns(t, setRowAction), [t])

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
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("aiFunctions.title")}
        </CardTitle>
        <CardDescription>{t("aiFunctions.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <AIFunctionsTableToolbarActions workspaceId={workspaceId} />
          </DataTableToolbar>
        </DataTable>

        <AIFunctionsCreate
          initialData={rowAction?.row.original}
          mode={rowAction?.variant === "duplicate" ? "duplicate" : "edit"}
          onOpenChange={(open) => !open && setRowAction(null)}
          onSuccess={() => {
            router.refresh()
          }}
          open={
            rowAction?.variant === "edit" || rowAction?.variant === "duplicate"
          }
          workspaceId={workspaceId}
        />

        <DeleteAIFunctionDialog
          aiFunction={rowAction?.row.original ?? null}
          onOpenChange={(open) => !open && setRowAction(null)}
          onSuccess={() => {
            router.refresh()
          }}
          open={rowAction?.variant === "delete"}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
