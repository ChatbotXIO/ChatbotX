"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import {
  formatOrderMoney,
  type StoreCurrencyFormat,
} from "@/features/orders/lib/order-money"
import { DeleteDiscountCodeDialog } from "./components/delete-discount-code-dialog"
import {
  type DiscountCodeRowAction,
  getDiscountCodeColumns,
} from "./discount-codes-table-columns"
import type { DiscountCodeResource } from "./schema/public"

export function DiscountCodesTable({
  workspaceId,
  discountCodes,
  store,
}: {
  workspaceId: string
  discountCodes: { data: DiscountCodeResource[]; pageCount: number }
  store: StoreCurrencyFormat
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [rowAction, setRowAction] = useState<DiscountCodeRowAction | null>(null)

  const columns = useMemo(
    () =>
      getDiscountCodeColumns({
        t,
        locale,
        workspaceId,
        formatAmount: (amount) =>
          formatOrderMoney(amount, store.currency, store),
        setRowAction,
      }),
    [t, locale, workspaceId, store],
  )

  const { table } = useDataTable({
    data: discountCodes.data,
    columns,
    pageCount: discountCodes.pageCount,
    initialState: { columnPinning: { right: ["actions"] } },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  const deleting = rowAction?.row.original ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("discountCodes.title")}
        </CardTitle>
        <CardDescription>{t("discountCodes.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <Link
              className={buttonVariants()}
              href={`/space/${workspaceId}/discount-codes/new`}
            >
              <PlusIcon className="h-4 w-4" />
              {t("discountCodes.add")}
            </Link>
          </DataTableToolbar>
        </DataTable>
        {deleting ? (
          <DeleteDiscountCodeDialog
            discountCode={deleting}
            onOpenChange={(open) => !open && setRowAction(null)}
            open
            workspaceId={workspaceId}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
