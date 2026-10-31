"use client"

import type { PlaceLocationItem } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import type { ColumnDef } from "@tanstack/react-table"
import {
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import type { useTranslations } from "next-intl"

export type LocationRowAction = {
  location: PlaceLocationItem
  variant: "edit" | "delete"
}

export const getLocationColumns = ({
  t,
  setRowAction,
}: {
  t: ReturnType<typeof useTranslations>
  setRowAction: (action: LocationRowAction | null) => void
}): ColumnDef<PlaceLocationItem>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: t("fields.name.label"),
    // The cell is a full-width ghost button because DataTable has no
    // row-click prop; it opens the edit dialog.
    cell: ({ row }) => (
      <Button
        className="h-auto w-full justify-start px-0 py-1 font-medium"
        onClick={() =>
          setRowAction({ location: row.original, variant: "edit" })
        }
        type="button"
        variant="ghost"
      >
        <span className="block max-w-[400px] truncate">
          {row.original.name}
        </span>
      </Button>
    ),
    meta: { label: t("fields.name.label"), variant: "text" },
    enableColumnFilter: true,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "coordinates",
    header: t("placesNearMe.locations.columns.coordinates"),
    cell: ({ row }) => (
      <Button
        className="h-auto w-full justify-start px-0 py-1 font-normal tabular-nums"
        onClick={() =>
          setRowAction({ location: row.original, variant: "edit" })
        }
        type="button"
        variant="ghost"
      >
        {`${row.original.latitude}, ${row.original.longitude}`}
      </Button>
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
              setRowAction({ location: row.original, variant: "edit" })
            }
          >
            <PencilIcon className="me-2 h-4 w-4" />
            {t("actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              // biome-ignore lint/a11y/useAnchorContent: DropdownMenuItem injects the label as the anchor's children
              <a
                href={row.original.previewUrl}
                rel="noopener noreferrer"
                target="_blank"
              />
            }
          >
            <ExternalLinkIcon className="me-2 h-4 w-4" />
            {t("placesNearMe.locations.preview")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() =>
              setRowAction({ location: row.original, variant: "delete" })
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
