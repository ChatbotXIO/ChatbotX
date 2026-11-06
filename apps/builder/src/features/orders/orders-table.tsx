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
import type { ShopifyStoreLinks } from "@/features/products/lib/shopify-admin-url"
import { OrderShopifyDetailsDialog } from "@/features/shopify/components/order-shopify-details-dialog"
import { OrderSyncButton } from "@/features/shopify/components/order-sync-button"
import { DeleteOrderDialog } from "./components/delete-order-dialog"
import { OrdersExportButton } from "./components/orders-export-button"
import type { StoreCurrencyFormat } from "./lib/order-money"
import { getOrderColumns, type OrderRowAction } from "./orders-table-columns"
import type { OrderListResponse } from "./schema/resource"

type OrdersTableProps = {
  orders: OrderListResponse
  store: StoreCurrencyFormat
  workspaceId: string
  /** Set while the store source is Shopify: orders are read-only. */
  shopifyStore?: ShopifyStoreLinks
}

export function OrdersTable({
  orders,
  store,
  workspaceId,
  shopifyStore,
}: OrdersTableProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [rowAction, setRowAction] = useState<OrderRowAction | null>(null)

  const columns = useMemo(
    () =>
      getOrderColumns({
        t,
        locale,
        store,
        workspaceId,
        setRowAction,
        shopifyStore,
      }),
    [t, locale, store, workspaceId, shopifyStore],
  )

  const { table } = useDataTable({
    data: orders.data,
    columns,
    pageCount: orders.pageCount,
    initialState: {
      columnPinning: { right: ["actions"] },
      columnVisibility: { fulfillmentStatus: false },
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  const deleting =
    rowAction?.variant === "delete" ? rowAction.row.original : undefined
  const viewing =
    rowAction?.variant === "view" ? rowAction.row.original : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">{t("orders.title")}</CardTitle>
        <CardDescription>{t("orders.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <OrdersExportButton table={table} workspaceId={workspaceId} />
            {shopifyStore ? (
              <OrderSyncButton workspaceId={workspaceId} />
            ) : null}
          </DataTableToolbar>
        </DataTable>

        {viewing && shopifyStore ? (
          <OrderShopifyDetailsDialog
            currencyFormat={store}
            onOpenChange={() => setRowAction(null)}
            order={viewing}
            store={shopifyStore}
            workspaceId={workspaceId}
          />
        ) : null}

        {deleting ? (
          <DeleteOrderDialog
            onOpenChange={(open) => !open && setRowAction(null)}
            open
            orderId={deleting.id}
            orderNumber={deleting.number}
            workspaceId={workspaceId}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
