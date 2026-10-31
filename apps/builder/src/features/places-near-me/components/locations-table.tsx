"use client"

import type {
  PlaceCategoryListItem,
  PlaceLocationItem,
} from "@chatbotx.io/business"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { DeleteLocationDialog } from "./delete-location-dialog"
import { getLocationColumns, type LocationRowAction } from "./location-columns"
import { LocationFormDialog } from "./location-form-dialog"

type LocationsTableProps = {
  workspaceId: string
  locations: { data: PlaceLocationItem[]; pageCount: number }
  categories: PlaceCategoryListItem[]
}

export function LocationsTable({
  workspaceId,
  locations,
  categories,
}: LocationsTableProps) {
  const t = useTranslations()
  const [rowAction, setRowAction] = useState<LocationRowAction | null>(null)

  const columns = useMemo(() => getLocationColumns({ t, setRowAction }), [t])

  const { table } = useDataTable({
    data: locations.data,
    columns,
    pageCount: locations.pageCount,
    initialState: { columnPinning: { right: ["actions"] } },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  const editing = rowAction?.variant === "edit" ? rowAction.location : null
  const deleting = rowAction?.variant === "delete" ? rowAction.location : null

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        labels={{ noResults: t("placesNearMe.locations.empty") }}
        table={table}
      >
        <DataTableToolbar table={table}>
          <LocationFormDialog
            categories={categories}
            workspaceId={workspaceId}
          />
        </DataTableToolbar>
      </DataTable>
      {editing ? (
        <LocationFormDialog
          categories={categories}
          hideTrigger
          key={editing.id}
          location={editing}
          onOpenChange={(open) => !open && setRowAction(null)}
          open
          workspaceId={workspaceId}
        />
      ) : null}
      {deleting ? (
        <DeleteLocationDialog
          location={deleting}
          onOpenChange={(open) => !open && setRowAction(null)}
          open
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
