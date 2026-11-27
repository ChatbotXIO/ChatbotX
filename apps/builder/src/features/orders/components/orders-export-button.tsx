"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { DownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { exportOrdersAction } from "../actions/export-orders.action"
import type { ExportOrdersRequest } from "../schema/action"
import type { OrderListItem } from "../schema/resource"

const CSV_BYTE_ORDER_MARK = "﻿"

const downloadCsv = (csv: string) => {
  const url = URL.createObjectURL(
    new Blob([CSV_BYTE_ORDER_MARK, csv], { type: "text/csv;charset=utf-8" }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = "orders.csv"
  link.click()
  URL.revokeObjectURL(url)
}

const filterValues = (table: Table<OrderListItem>, columnId: string) => {
  const value = table.getColumn(columnId)?.getFilterValue()
  if (Array.isArray(value)) {
    return value.map(String)
  }
  return typeof value === "string" && value ? [value] : undefined
}

/** Downloads the orders the table currently shows (all pages) as CSV. */
export function OrdersExportButton({
  table,
  workspaceId,
}: {
  table: Table<OrderListItem>
  workspaceId: string
}) {
  const t = useTranslations()
  const { execute, isPending } = useAction(
    exportOrdersAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (!data) {
          return
        }
        downloadCsv(data.csv)
        if (data.truncated) {
          toast.warning(t("orders.exportTruncated", { count: data.rowCount }))
        }
      },
      onError: toastActionError(t("orders.exportError")),
    },
  )

  const handleExport = () => {
    const keyword = filterValues(table, "keyword")?.[0]
    execute({
      keyword,
      paymentStatus: filterValues(
        table,
        "paymentStatus",
      ) as ExportOrdersRequest["paymentStatus"],
      fulfillmentStatus: filterValues(
        table,
        "fulfillmentStatus",
      ) as ExportOrdersRequest["fulfillmentStatus"],
    })
  }

  return (
    <Button
      disabled={isPending}
      onClick={handleExport}
      size="sm"
      variant="outline"
    >
      <DownloadIcon />
      {t("actions.export")}
    </Button>
  )
}
