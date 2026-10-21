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
import { DeleteOrderDialog } from "./components/delete-order-dialog"
import type { StoreCurrencyFormat } from "./lib/order-money"
import { getOrderColumns, type OrderRowAction } from "./orders-table-columns"
import type { OrderListResponse } from "./schema/resource"

type OrdersTableProps = {
  orders: OrderListResponse
  store: StoreCurrencyFormat
  workspaceId: string
}

export function OrdersTable({ orders, store, workspaceId }: OrdersTableProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [rowAction, setRowAction] = useState<OrderRowAction | null>(null)

  const columns = useMemo(
    () => getOrderColumns({ t, locale, store, workspaceId, setRowAction }),
    [t, locale, store, workspaceId],
  )

  const { table } = useDataTable({
    data: orders.data,
    columns,
    pageCount: orders.pageCount,
    initialState: { columnPinning: { right: ["actions"] } },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  const deleting = rowAction?.row.original

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">{t("orders.title")}</CardTitle>
        <CardDescription>{t("orders.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table} />
        </DataTable>

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
