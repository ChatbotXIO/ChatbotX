import {
  flexRender,
  type Row,
  type Table as TanstackTable,
} from "@tanstack/react-table"
import type * as React from "react"

import { DataTablePagination } from "@chatbotx.io/ui/components/data-table/data-table-pagination"
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
  // Callback ao clicar numa row (excluindo cliques no <a> / <button> /
  // <input>). Adicionado 2026-05-26 pra suportar abrir drawer de detalhes
  // na página /contacts (Pedro pediu "click no contato vê o que aparece").
  onRowClick?: (row: Row<TData>) => void
}

// Tags que NÃO devem disparar onRowClick (clique no checkbox, link, botão).
const INTERACTIVE_TAGS = new Set(["A", "BUTTON", "INPUT", "LABEL"])

function shouldIgnoreRowClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  let el: HTMLElement | null = target
  while (el && el.tagName !== "TR") {
    if (INTERACTIVE_TAGS.has(el.tagName)) {
      return true
    }
    if (el.getAttribute("role") === "button") {
      return true
    }
    el = el.parentElement
  }
  return false
}

export function DataTable<TData>({
  table,
  actionBar,
  onRowClick,
  children,
  className,
  ...props
}: DataTableProps<TData>) {
  return (
    <div
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      {...props}
    >
      {children}
      <div className="overflow-hidden rounded-md border">
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={
                    onRowClick
                      ? (e) => {
                          if (!shouldIgnoreRowClick(e.target)) {
                            onRowClick(row)
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{
                        ...getCommonPinningStyles({ column: cell.column }),
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
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
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2.5">
        <DataTablePagination table={table} />
        {actionBar &&
          table.getFilteredSelectedRowModel().rows.length > 0 &&
          actionBar}
      </div>
    </div>
  )
}
