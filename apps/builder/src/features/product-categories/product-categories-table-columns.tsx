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
import type { ColumnDef, Row } from "@tanstack/react-table"
import {
  FingerprintIcon,
  ListIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import type { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { WebshopLinkMenuItems } from "@/features/webshop/components/webshop-link-menu-items"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { toggleProductCategoryVisibleAction } from "./actions/update-product-category.action"
import type { ProductCategoryResource } from "./schema/resource"

export type CategoryRow = ProductCategoryResource & { childCount: number }

export type CategoryRowAction = {
  row: Row<CategoryRow>
  variant: "edit" | "delete"
}

function VisibleToggleCell({
  workspaceId,
  category,
  errorMessage,
}: {
  workspaceId: string
  category: CategoryRow
  errorMessage: string
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(category.isVisible)
  const { execute, isPending } = useAction(
    toggleProductCategoryVisibleAction.bind(null, workspaceId, category.id),
    {
      onSuccess: () => router.refresh(),
      onError: (error) => {
        setChecked(category.isVisible)
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
        execute({ isVisible: value })
      }}
    />
  )
}

export const getProductCategoryColumns = ({
  t,
  workspaceId,
  isSubcategoryLevel,
  setRowAction,
  onOpenSubcategories,
  onCopyId,
}: {
  t: ReturnType<typeof useTranslations>
  workspaceId: string
  /** Sub-categories have no children, so they get no "Subcategories" column or action. */
  isSubcategoryLevel: boolean
  setRowAction: (action: CategoryRowAction | null) => void
  onOpenSubcategories: (category: CategoryRow) => void
  onCopyId: (category: CategoryRow) => void
}): ColumnDef<CategoryRow>[] => [
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
        title={t("productCategories.columns.products")}
      />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.productCount}</span>
    ),
    enableSorting: false,
  },
  ...(isSubcategoryLevel
    ? []
    : [
        {
          id: "childCount",
          accessorKey: "childCount",
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title={t("productCategories.columns.subcategories")}
            />
          ),
          cell: ({ row }) => (
            <span className="tabular-nums">{row.original.childCount}</span>
          ),
          enableSorting: false,
        } satisfies ColumnDef<CategoryRow>,
      ]),
  {
    id: "isVisible",
    accessorKey: "isVisible",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t("productCategories.columns.visible")}
      />
    ),
    cell: ({ row }) => (
      <VisibleToggleCell
        category={row.original}
        errorMessage={t("productCategories.saveError")}
        key={`${row.original.id}-${row.original.isVisible}`}
        workspaceId={workspaceId}
      />
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
          {isSubcategoryLevel ? null : (
            <DropdownMenuItem onClick={() => onOpenSubcategories(row.original)}>
              <ListIcon className="me-2 h-4 w-4" />
              {t("productCategories.subcategories")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onCopyId(row.original)}>
            <FingerprintIcon className="me-2 h-4 w-4" />
            {t("productCategories.getId")}
          </DropdownMenuItem>
          <WebshopLinkMenuItems
            target={{ categoryId: row.original.id }}
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
