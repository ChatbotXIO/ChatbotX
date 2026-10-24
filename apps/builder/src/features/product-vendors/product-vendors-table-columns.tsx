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
import { formatDate } from "@chatbotx.io/ui/lib/format"
import type { ColumnDef, Row } from "@tanstack/react-table"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import type { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { WebshopLinkMenuItems } from "@/features/webshop/components/webshop-link-menu-items"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { toggleProductVendorActiveAction } from "./actions/update-product-vendor.action"
import type { ProductVendorResource } from "./schema/public"

export type VendorRow = ProductVendorResource & {
  productCount: number
  createdAt: Date
}

export type VendorRowAction = {
  row: Row<VendorRow>
  variant: "edit" | "delete"
}

function ActiveToggleCell({
  workspaceId,
  vendor,
  errorMessage,
}: {
  workspaceId: string
  vendor: VendorRow
  errorMessage: string
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(vendor.isActive)
  const { execute, isPending } = useAction(
    toggleProductVendorActiveAction.bind(null, workspaceId, vendor.id),
    {
      onSuccess: () => router.refresh(),
      onError: (error) => {
        setChecked(vendor.isActive)
        toastActionError(errorMessage)(error)
      },
    },
  )
  return (
    <Switch
      checked={checked}
      disabled={isPending}
      onCheckedChange={(value) => {
        setChecked(value)
        execute({ isActive: value })
      }}
    />
  )
}

export const getProductVendorColumns = ({
  t,
  locale,
  workspaceId,
  setRowAction,
}: {
  t: ReturnType<typeof useTranslations>
  locale: string
  workspaceId: string
  setRowAction: (action: VendorRowAction | null) => void
}): ColumnDef<VendorRow>[] => [
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
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t("fields.name.label")} />
    ),
    cell: ({ row }) => (
      <div className="flex max-w-[400px] items-center gap-2">
        {row.original.imageUrl ? (
          // biome-ignore lint/performance/noImgElement: merchant-supplied external URL
          <img
            alt=""
            className="size-8 shrink-0 rounded object-cover"
            height={32}
            src={row.original.imageUrl}
            width={32}
          />
        ) : null}
        <span className="truncate font-medium">{row.original.name}</span>
      </div>
    ),
    meta: {
      label: t("fields.name.label"),
      placeholder: t("fields.name.searchPlaceholder"),
      variant: "text",
    },
    enableColumnFilter: true,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "productCount",
    accessorKey: "productCount",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t("productVendors.columns.products")}
      />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.productCount}</span>
    ),
    enableSorting: false,
  },
  {
    id: "isActive",
    accessorKey: "isActive",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t("productVendors.columns.active")}
      />
    ),
    cell: ({ row }) => (
      <ActiveToggleCell
        errorMessage={t("productVendors.saveError")}
        key={`${row.original.id}-${row.original.isActive}`}
        vendor={row.original}
        workspaceId={workspaceId}
      />
    ),
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
            onClick={() => setRowAction({ row, variant: "edit" })}
          >
            <PencilIcon className="me-2 h-4 w-4" />
            {t("actions.edit")}
          </DropdownMenuItem>
          <WebshopLinkMenuItems
            target={{ vendorId: row.original.id }}
            workspaceId={workspaceId}
          />
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
