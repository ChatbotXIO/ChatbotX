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
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { EllipsisVerticalIcon, PencilIcon, Trash } from "lucide-react"
import Link from "next/link"
import type { useTranslations } from "next-intl"
import {
  type Dispatch,
  type SetStateAction,
  useState,
  useTransition,
} from "react"
import { toggleProductActiveAction } from "./actions/toggle-product-active-action"
import type { ProductResource } from "./schema/resource"

function ActiveToggleCell({ product }: { product: ProductResource }) {
  const [isPending, startTransition] = useTransition()
  const [isActive, setIsActive] = useState(product.isActive)

  function handleToggle(checked: boolean) {
    setIsActive(checked)
    startTransition(async () => {
      await toggleProductActiveAction.bind(
        null,
        product.workspaceId,
        product.id,
      )({ isActive: checked })
    })
  }

  return (
    <Switch
      checked={isActive}
      disabled={isPending}
      onCheckedChange={handleToggle}
    />
  )
}

type GetColumnsProps = {
  t: ReturnType<typeof useTranslations>
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<ProductResource> | null>
  >
}

export function getProductColumns({
  t,
  setRowAction,
}: GetColumnsProps): ColumnDef<ProductResource>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label={t("actions.selectAll")}
          checked={table.getIsAllPageRowsSelected()}
          className="translate-y-0.5"
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
          className="translate-y-0.5"
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        />
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.name.label")} />
      ),
      cell: ({ row }) => (
        <span className="max-w-75 truncate font-medium">
          {row.original.name}
        </span>
      ),
      meta: {
        label: t("fields.name.label"),
        placeholder: t("fields.name.placeholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      size: 300,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "price",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("products.fields.price.label")}
        />
      ),
      cell: ({ row }) => <span>${row.original.price.toFixed(2)}</span>,
      size: 120,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "inventoryQuantity",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("products.fields.inventoryQuantity.label")}
        />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.inventoryQuantity}
        </span>
      ),
      size: 120,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "sku",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("products.fields.sku.label")}
        />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.sku ?? "—"}</span>
      ),
      size: 150,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "category",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("products.fields.category.label")}
        />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.category ?? "—"}
        </span>
      ),
      size: 150,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "isActive",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("products.fields.isActive.label")}
        />
      ),
      cell: ({ row }) => <ActiveToggleCell product={row.original} />,
      size: 100,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "actions",
      header: t("actions.actions"),
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Open menu"
                className="flex size-8 p-0 data-[state=open]:bg-muted"
                variant="ghost"
              >
                <EllipsisVerticalIcon aria-hidden="true" className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              render={
                <Link
                  href={`/space/${row.original.workspaceId}/products/${row.original.id}/edit`}
                >
                  <PencilIcon />
                  {t("actions.edit")}
                </Link>
              }
            />
            <DropdownMenuItem
              onClick={() => setRowAction({ row, variant: "delete" })}
              variant="destructive"
            >
              <Trash />
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
