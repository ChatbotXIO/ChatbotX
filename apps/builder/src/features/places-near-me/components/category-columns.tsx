"use client"

import type { PlaceCategoryListItem } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import type { useTranslations } from "next-intl"

export type CategoryRowAction = {
  category: PlaceCategoryListItem
  variant: "edit" | "delete"
}

export const getCategoryColumns = ({
  t,
  setRowAction,
}: {
  t: ReturnType<typeof useTranslations>
  setRowAction: (action: CategoryRowAction | null) => void
}): ColumnDef<PlaceCategoryListItem>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: t("fields.name.label"),
    // A full-width ghost button so clicking the name opens the edit dialog.
    cell: ({ row }) => (
      <Button
        className="h-auto w-full justify-start px-0 py-1 font-medium"
        onClick={() =>
          setRowAction({ category: row.original, variant: "edit" })
        }
        type="button"
        variant="ghost"
      >
        <span className="block max-w-[400px] truncate">
          {row.original.name}
        </span>
      </Button>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "rank",
    accessorKey: "rank",
    header: t("ecommerceSettings.rank.label"),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.rank}</span>
    ),
    enableSorting: false,
  },
  {
    id: "locationCount",
    accessorKey: "locationCount",
    header: t("placesNearMe.categories.columns.locations"),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.locationCount}</span>
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
            onClick={() =>
              setRowAction({ category: row.original, variant: "edit" })
            }
          >
            <PencilIcon className="me-2 h-4 w-4" />
            {t("actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() =>
              setRowAction({ category: row.original, variant: "delete" })
            }
          >
            <Trash2Icon className="me-2 h-4 w-4" />
            {t("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    size: 40,
    enableSorting: false,
    enableHiding: false,
  },
]
