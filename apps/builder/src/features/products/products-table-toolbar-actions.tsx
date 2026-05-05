"use client"

import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import type { Dispatch, SetStateAction } from "react"
import { DeleteProductsDialog } from "./delete-product-dialog"
import type { ProductResource } from "./schema/resource"

type ProductsTableToolbarActionsProps = {
  table: Table<ProductResource>
  workspaceId: string
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<ProductResource> | null>
  >
}

export function ProductsTableToolbarActions({
  table,
  workspaceId,
  setRowAction,
}: ProductsTableToolbarActionsProps) {
  const router = useRouter()

  const selectedRows = table.getFilteredSelectedRowModel().rows

  if (selectedRows.length === 0) {
    return null
  }

  return (
    <DeleteProductsDialog
      onOpenChange={() => setRowAction(null)}
      onSuccess={() => {
        table.toggleAllRowsSelected(false)
        router.refresh()
      }}
      products={selectedRows.map((row) => row.original)}
      workspaceId={workspaceId}
    />
  )
}
