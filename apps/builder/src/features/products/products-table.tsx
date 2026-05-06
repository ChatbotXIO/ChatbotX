"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { SiFacebook } from "@icons-pack/react-simple-icons"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { DeleteProductsDialog } from "./delete-product-dialog"
import { getProductColumns } from "./products-table-columns"
import { ProductsTableToolbarActions } from "./products-table-toolbar-actions"
import type { ListProductsResponse } from "./schema/query"
import type { ProductResource } from "./schema/resource"

type ProductsTableProps = {
  promises: Promise<[ListProductsResponse]>
  workspaceId: string
}

export function ProductsTable({ promises, workspaceId }: ProductsTableProps) {
  const t = useTranslations()
  const router = useRouter()

  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<ProductResource> | null>(null)

  const columns = useMemo(() => getProductColumns({ t, setRowAction }), [t])

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
          {t("products.title")}
        </CardTitle>
        <CardAction>
          <Button size="sm" type="button">
            <SiFacebook />
            {t("actions.syncMetaCatalog")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <ProductsTableToolbarActions
              setRowAction={setRowAction}
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteProductsDialog
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            rowAction?.row.toggleSelected(false)
            router.refresh()
          }}
          open={rowAction?.variant === "delete"}
          products={rowAction?.row.original ? [rowAction.row.original] : []}
          showTrigger={false}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
