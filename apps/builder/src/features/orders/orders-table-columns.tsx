"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import type { ColumnDef, Row } from "@tanstack/react-table"
import { EyeIcon, MoreHorizontalIcon, StarIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import type { useTranslations } from "next-intl"
import { OrderPaymentBadge } from "./components/order-payment-badge"
import { OrderStatusBadge } from "./components/order-status-badge"
import { formatOrderMoney, type StoreCurrencyFormat } from "./lib/order-money"
import type { OrderListItem } from "./schema/resource"

export type OrderRowAction = {
  row: Row<OrderListItem>
  variant: "delete"
}

type GetColumnsProps = {
  t: ReturnType<typeof useTranslations>
  locale: string
  store: StoreCurrencyFormat
  workspaceId: string
  setRowAction: (action: OrderRowAction | null) => void
}

export function getOrderColumns({
  t,
  locale,
  store,
  workspaceId,
  setRowAction,
}: GetColumnsProps): ColumnDef<OrderListItem>[] {
  const detailHref = (orderId: string) =>
    `/space/${workspaceId}/orders/${orderId}`

  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label={t("actions.selectAll")}
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(Boolean(value))
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={t("actions.selectRow")}
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        />
      ),
      size: 32,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "keyword",
      accessorKey: "customerName",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("orders.columns.name")}
        />
      ),
      cell: ({ row }) => (
        <Link
          className="max-w-[300px] truncate font-medium hover:underline"
          href={detailHref(row.original.id)}
        >
          {row.original.customerName ??
            t("orders.orderNumber", { number: row.original.number })}
        </Link>
      ),
      meta: {
        label: t("orders.columns.name"),
        placeholder: t("orders.searchPlaceholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "total",
      accessorKey: "total",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("orders.columns.total")}
        />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatOrderMoney(row.original.total, row.original.currency, store)}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "payment",
      accessorKey: "paymentStatus",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("orders.columns.payment")}
        />
      ),
      cell: ({ row }) => <OrderPaymentBadge order={row.original} />,
      enableSorting: false,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("orders.columns.orderStatus")}
        />
      ),
      cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
      enableSorting: false,
    },
    {
      id: "rating",
      accessorKey: "rating",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("orders.columns.rating")}
        />
      ),
      cell: ({ row }) =>
        row.original.rating ? (
          <span className="flex items-center gap-1 tabular-nums">
            <StarIcon className="size-4 fill-amber-400 text-amber-400" />
            {row.original.rating}
          </span>
        ) : null,
      enableSorting: false,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.createdAt.label")}
        />
      ),
      cell: ({ row }) => (
        <span className="font-medium">
          {formatDate(row.original.createdAt, { locale })}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "actions",
      header: t("actions.actions"),
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon" variant="ghost">
                <MoreHorizontalIcon className="h-4 w-4" />
                <span className="sr-only">{t("actions.openMenu")}</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              render={<Link href={detailHref(row.original.id)} />}
            >
              <EyeIcon className="me-2 h-4 w-4" />
              {t("actions.view")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setRowAction({ row, variant: "delete" })}
            >
              <Trash2Icon className="me-2 h-4 w-4" />
              {t("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
