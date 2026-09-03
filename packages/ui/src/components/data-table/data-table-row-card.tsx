import { cn } from "@chatbotx.io/ui/lib/utils"
import { flexRender, type Row } from "@tanstack/react-table"

/**
 * Generic mobile card for one table row, for use as `DataTable`'s `mobileCard`.
 *
 * It renders the row's own cells through `flexRender`, so every cell keeps the
 * renderer, formatting, and interactivity the table column already defines —
 * there is no second copy of a cell to drift, and no new translation keys: the
 * field names come from each column's `meta.label`.
 *
 * The `select` and `actions` columns are lifted into a header strip, since a
 * checkbox and a row menu read as chrome rather than as fields. Any column
 * without a `meta.label` still renders, just without a label.
 *
 * Tables whose card view should show *fewer* fields, or a bespoke arrangement,
 * should pass their own `mobileCard` instead of this.
 */

const CHROME_COLUMN_IDS = new Set(["select", "actions"])

export function DataTableRowCard<TData>({
  row,
  className,
}: {
  row: Row<TData>
  className?: string
}) {
  const cells = row.getVisibleCells()
  const chrome = cells.filter((cell) => CHROME_COLUMN_IDS.has(cell.column.id))
  const fields = cells.filter((cell) => !CHROME_COLUMN_IDS.has(cell.column.id))

  return (
    <div className={cn("flex flex-col gap-2 rounded-md border p-3", className)}>
      {chrome.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          {chrome.map((cell) => (
            <div key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          ))}
        </div>
      )}
      <dl className="flex flex-col gap-1.5">
        {fields.map((cell) => {
          const label = cell.column.columnDef.meta?.label
          return (
            <div
              className="flex items-baseline justify-between gap-3"
              key={cell.id}
            >
              {label ? (
                <dt className="shrink-0 text-muted-foreground text-xs">
                  {label}
                </dt>
              ) : null}
              <dd className="min-w-0 text-sm ltr:text-right rtl:text-left">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
