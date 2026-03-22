"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { EllipsisIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { CreatePlanDialog } from "./create-plan"
import type { ListPlansResponse } from "./schemas/query"
import type { PlanResource } from "./schemas/resource"
import { UpdatePlanDialog } from "./update-plan"

type PlansTableProps = {
  promises: Promise<[ListPlansResponse]>
}

const getPlansColumns = ({
  t,
  setRowAction,
}: {
  t: ReturnType<typeof useTranslations>
  setRowAction: (action: DataTableRowAction<PlanResource> | null) => void
}): ColumnDef<PlanResource>[] => {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.name.label")} />
      ),
      cell: ({ row }) => <div>{row.original.name}</div>,
      size: 200,
      meta: {
        label: t("fields.name.label"),
        placeholder: t("fields.name.placeholder"),
        variant: "text",
      },
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      id: "description",
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.description.label")}
        />
      ),
      cell: ({ row }) => (
        <div className="max-w-md text-muted-foreground text-sm">
          {row.original.description}
        </div>
      ),
      size: 320,
      meta: {
        label: t("fields.description.label"),
        placeholder: t("fields.description.placeholder"),
        variant: "text",
      },
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      id: "marketingFeatures",
      accessorKey: "marketingFeatures",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.marketingFeatures.label")}
        />
      ),
      cell: ({ row }) => {
        const features = row.original.marketingFeatures ?? []

        if (!features.length) {
          return <span className="text-muted-foreground text-sm">-</span>
        }

        return (
          <div className="flex max-w-md flex-col gap-1 text-sm">
            {features.slice(0, 3).map((feature, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: safe to use index
              <span className="truncate" key={index}>
                {feature}
              </span>
            ))}
          </div>
        )
      },
      size: 320,
      meta: {
        label: t("fields.marketingFeatures.label"),
        variant: "text",
      },
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      id: "price",
      accessorKey: "price",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.price.label")}
        />
      ),
      cell: ({ row }) => {
        const { price, currency } = row.original

        if (price == null) {
          return <span className="text-muted-foreground text-sm">-</span>
        }

        const formatted = new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(price)

        return <span className="text-sm">{formatted}</span>
      },
      size: 140,
      meta: {
        label: t("fields.price.label"),
        variant: "number",
      },
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      id: "annualDiscountPrice",
      accessorKey: "annualDiscountPrice",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.annualPrice.label")}
        />
      ),
      cell: ({ row }) => {
        const { annualDiscountPrice, currency } = row.original

        if (annualDiscountPrice == null) {
          return <span className="text-muted-foreground text-sm">-</span>
        }

        const formatted = new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(annualDiscountPrice)

        return <span className="text-sm">{formatted}</span>
      },
      size: 160,
      meta: {
        label: t("fields.annualPrice.label"),
        variant: "number",
      },
      enableColumnFilter: false,
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("actions.openMenu")}
                size="icon"
                variant="ghost"
              >
                <EllipsisIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  setRowAction({ row, variant: "update" })
                }}
              >
                {t("actions.update")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
  ]
}

const PlansTable = (props: PlansTableProps) => {
  const [{ data, pageCount }] = use(props.promises)
  const t = useTranslations()
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<PlanResource> | null>(null)

  const columns = useMemo(
    () =>
      getPlansColumns({
        t,
        setRowAction,
      }),
    [t],
  )

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
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <CreatePlanDialog />
        </DataTableToolbar>
      </DataTable>

      {rowAction?.variant === "update" && (
        <UpdatePlanDialog
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "update"}
          plan={rowAction?.row.original}
        />
      )}
    </>
  )
}

export default PlansTable
