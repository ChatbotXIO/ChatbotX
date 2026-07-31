"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import type { listImports } from "@/features/import/queries/list-imports.queries"
import { ImportProductDialog } from "./components/import-product-dialog"
import { MetaCatalogDialog } from "./components/meta-catalog-dialog"
import { DeleteProductsDialog } from "./delete-product-dialog"
import { getProductColumns } from "./products-table-columns"
import { ProductsTableToolbarActions } from "./products-table-toolbar-actions"
import type { ListProductsResponse } from "./schema/query"
import type { ProductResource } from "./schema/resource"

type ProductsTableProps = {
  promises: Promise<[ListProductsResponse]>
  workspaceId: string
  importHistoryPromise: Promise<[Awaited<ReturnType<typeof listImports>>]>
  initialMetaCatalogState: Parameters<
    typeof MetaCatalogDialog
  >[0]["initialState"]
}

export function ProductsTable({
  promises,
  workspaceId,
  importHistoryPromise,
  initialMetaCatalogState,
}: ProductsTableProps) {
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
  const selectedProductIds = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("products.title")}
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            <Link
              className={buttonVariants({ size: "sm" })}
              href={`/space/${workspaceId}/products/create`}
            >
              <PlusIcon />
              {t("actions.create")}
            </Link>
            <ImportProductDialog
              historyPromise={importHistoryPromise}
              workspaceId={workspaceId}
            />
            <MetaCatalogDialog
              initialState={initialMetaCatalogState}
              selectedProductIds={selectedProductIds}
              workspaceId={workspaceId}
            />
          </div>
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
