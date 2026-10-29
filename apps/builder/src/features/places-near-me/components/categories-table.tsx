"use client"

import type { PlaceCategoryListItem } from "@chatbotx.io/business"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { type CategoryRowAction, getCategoryColumns } from "./category-columns"
import { CategoryFormDialog } from "./category-form-dialog"
import { DeleteCategoryDialog } from "./delete-category-dialog"

type CategoriesTableProps = {
  workspaceId: string
  categories: PlaceCategoryListItem[]
}

export function CategoriesTable({
  workspaceId,
  categories,
}: CategoriesTableProps) {
  const t = useTranslations()
  const [rowAction, setRowAction] = useState<CategoryRowAction | null>(null)

  const columns = useMemo(() => getCategoryColumns({ t, setRowAction }), [t])

  // Rows arrive pre-sorted from the service and there is no pagination, so a
  // plain table avoids the URL-synced state `useDataTable` carries.
  const table = useReactTable({
    data: categories,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  })

  const editing = rowAction?.variant === "edit" ? rowAction.category : null
  const deleting = rowAction?.variant === "delete" ? rowAction.category : null

  return (
    <div className="flex flex-col gap-4">
      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-muted-foreground text-sm">
            {t("placesNearMe.categories.empty")}
          </p>
          <CategoryFormDialog workspaceId={workspaceId} />
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <CategoryFormDialog workspaceId={workspaceId} />
          </div>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        style={{ width: header.column.columnDef.size }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={{ width: cell.column.columnDef.size }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {editing ? (
        <CategoryFormDialog
          category={editing}
          hideTrigger
          key={editing.id}
          onOpenChange={(open) => !open && setRowAction(null)}
          open
          workspaceId={workspaceId}
        />
      ) : null}
      {deleting ? (
        <DeleteCategoryDialog
          category={deleting}
          onOpenChange={(open) => !open && setRowAction(null)}
          open
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
