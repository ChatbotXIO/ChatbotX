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
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import type { ProductCategoryResource } from "@/features/product-categories/schema/resource"
import { DeleteVendorDialog } from "./components/delete-vendor-dialog"
import { VendorFormDialog } from "./components/vendor-form-dialog"
import {
  getProductVendorColumns,
  type VendorRow,
  type VendorRowAction,
} from "./product-vendors-table-columns"

type ProductVendorsTableProps = {
  workspaceId: string
  vendors: { data: VendorRow[]; pageCount: number }
  categories: ProductCategoryResource[]
  openHours: Array<{ id: string; name: string }>
}

export function ProductVendorsTable({
  workspaceId,
  vendors,
  categories,
  openHours,
}: ProductVendorsTableProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [rowAction, setRowAction] = useState<VendorRowAction | null>(null)

  const columns = useMemo(
    () => getProductVendorColumns({ t, locale, workspaceId, setRowAction }),
    [t, locale, workspaceId],
  )

  const { table } = useDataTable({
    data: vendors.data,
    columns,
    pageCount: vendors.pageCount,
    initialState: { columnPinning: { right: ["actions"] } },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  const editing = rowAction?.variant === "edit" ? rowAction.row.original : null
  const deleting =
    rowAction?.variant === "delete" ? rowAction.row.original : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("productVendors.title")}
        </CardTitle>
        <CardDescription>{t("productVendors.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <VendorFormDialog
              categories={categories}
              openHours={openHours}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        {editing ? (
          <VendorFormDialog
            categories={categories}
            hideTrigger
            key={editing.id}
            onOpenChange={(open) => !open && setRowAction(null)}
            open
            openHours={openHours}
            vendor={editing}
            workspaceId={workspaceId}
          />
        ) : null}
        {deleting ? (
          <DeleteVendorDialog
            onOpenChange={(open) => !open && setRowAction(null)}
            open
            vendor={deleting}
            workspaceId={workspaceId}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
