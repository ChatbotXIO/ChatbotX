import {
  flexRender,
  type Row,
  type Table as TanstackTable,
} from "@tanstack/react-table"
import type * as React from "react"

import { DataTablePagination } from "@chatbotx.io/ui/components/data-table/data-table-pagination"
import type { DataTablePaginationLabels } from "@chatbotx.io/ui/components/data-table/data-table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { getCommonPinningStyles } from "@chatbotx.io/ui/lib/data-table"
import { cn } from "@chatbotx.io/ui/lib/utils"

interface DataTableProps<TData> extends React.ComponentProps<"div"> {
  table: TanstackTable<TData>
  actionBar?: React.ReactNode
  labels?: DataTablePaginationLabels & {
    noResults?: string
  }
  /**
   * Whether the bordered table region scrolls horizontally when its columns
   * exceed the available width.
   *
   * Defaults to `true`. Clipping is only ever right for a table whose columns
   * are guaranteed to fit; every other table loses its rightmost columns with
   * no way to reach them, which on a phone is most of the row.
   */
  scrollable?: boolean
  /**
   * Renders one row as a card for narrow viewports.
   *
   * When supplied, the card list replaces the table below `md` and the table
   * takes over from `md` up — a wide table reduced to horizontal scrolling is
   * readable but miserable to work through on a phone. Toolbar and pagination
   * are shared by both.
   *
   * The switch is CSS, not a media-query hook, so the correct layout is present
   * in the first paint instead of flipping after hydration. Both trees are in
   * the DOM, which is why this is opt-in: pay the duplication only where the
   * card view earns it.
   */
  mobileCard?: (row: Row<TData>) => React.ReactNode
}

export function DataTable<TData>({
  table,
  actionBar,
  labels,
  scrollable = true,
  mobileCard,
  children,
  className,
  ...props
}: DataTableProps<TData>) {
  const rows = table.getRowModel().rows
  const noResults = labels?.noResults ?? "No results."

  return (
    <div
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      {...props}
    >
      {children}
      {mobileCard && (
        <div
          className="flex flex-col gap-2 md:hidden"
          data-slot="data-table-cards"
        >
          {rows.length ? (
            rows.map((row) => (
              <div
                data-slot="data-table-card"
                data-state={row.getIsSelected() && "selected"}
                key={row.id}
              >
                {mobileCard(row)}
              </div>
            ))
          ) : (
            <div className="rounded-md border p-6 text-center">{noResults}</div>
          )}
        </div>
      )}
      <div
        className={cn(
          "rounded-md border",
          scrollable ? "overflow-x-auto" : "overflow-hidden",
          mobileCard && "hidden md:block",
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      ...getCommonPinningStyles({ column: header.column }),
                      width:
                        header.column.columnDef.size === undefined
                          ? undefined
                          : header.getSize(),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{
                        ...getCommonPinningStyles({ column: cell.column }),
                        width:
                          cell.column.columnDef.size === undefined
                            ? undefined
                            : cell.column.getSize(),
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center"
                >
                  {noResults}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2.5">
        <DataTablePagination labels={labels} table={table} />
        {actionBar &&
          table.getFilteredSelectedRowModel().rows.length > 0 &&
          actionBar}
      </div>
    </div>
  )
}
