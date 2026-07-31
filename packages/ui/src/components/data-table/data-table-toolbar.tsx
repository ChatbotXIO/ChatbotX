"use client"

import type { Column, Table } from "@tanstack/react-table"
import { X } from "lucide-react"
import * as React from "react"

import { DataTableDateFilter } from "@chatbotx.io/ui/components/data-table/data-table-date-filter"
import { DataTableFacetedFilter } from "@chatbotx.io/ui/components/data-table/data-table-faceted-filter"
import { DataTableSelectFilter } from "@chatbotx.io/ui/components/data-table/data-table-select-filter"
import { DataTableSliderFilter } from "@chatbotx.io/ui/components/data-table/data-table-slider-filter"
import { DataTableViewOptions } from "@chatbotx.io/ui/components/data-table/data-table-view-options"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { cn } from "@chatbotx.io/ui/lib/utils"

interface DataTableToolbarProps<TData> extends React.ComponentProps<"div"> {
  table: Table<TData>
  locale?: string
}

export function DataTableToolbar<TData>({
  table,
  children,
  className,
  locale,
  ...props
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0

  const columns = React.useMemo(
    () => table.getAllColumns().filter((column) => column.getCanFilter()),
    [table],
  )

  const onReset = React.useCallback(() => {
    table.resetColumnFilters()
  }, [table])

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        "flex w-full items-start justify-between gap-2 p-1",
        className,
      )}
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {columns.map((column) => (
          <DataTableToolbarFilter
            key={column.id}
            column={column}
            locale={locale}
          />
        ))}
        {isFiltered && (
          <Button
            aria-label="Reset filters"
            variant="outline"
            size="sm"
            className="border-dashed"
            onClick={onReset}
          >
            <X />
            Reset
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
      </div>
    </div>
  )
}
interface DataTableToolbarFilterProps<TData> {
  column: Column<TData>
  locale?: string
}

function DataTableToolbarFilter<TData>({
  column,
  locale,
}: DataTableToolbarFilterProps<TData>) {
  {
    const columnMeta = column.columnDef.meta

    const onFilterRender = React.useCallback(() => {
      if (!columnMeta?.variant) return null

      switch (columnMeta.variant) {
        case "text":
          return (
            <Input
              placeholder={columnMeta.placeholder ?? columnMeta.label}
              value={(column.getFilterValue() as string) ?? ""}
              onChange={(event) => column.setFilterValue(event.target.value)}
              className="h-8 w-40 lg:w-56"
            />
          )

        case "number":
          return (
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                placeholder={columnMeta.placeholder ?? columnMeta.label}
                value={(column.getFilterValue() as string) ?? ""}
                onChange={(event) => column.setFilterValue(event.target.value)}
                className={cn("h-8 w-[120px]", columnMeta.unit && "pe-8")}
              />
              {columnMeta.unit && (
                <span className="absolute top-0 end-0 bottom-0 flex items-center rounded-e-md bg-accent px-2 text-muted-foreground text-sm">
                  {columnMeta.unit}
                </span>
              )}
            </div>
          )

        case "range":
          return (
            <DataTableSliderFilter
              column={column}
              title={columnMeta.label ?? column.id}
            />
          )

        case "date":
        case "dateRange":
          return (
            <DataTableDateFilter
              column={column}
              title={columnMeta.label ?? column.id}
              multiple={columnMeta.variant === "dateRange"}
              locale={locale}
            />
          )

        case "select":
          return (
            <DataTableSelectFilter
              column={column}
              title={columnMeta.placeholder ?? columnMeta.label ?? column.id}
              options={columnMeta.options ?? []}
            />
          )

        case "multiSelect":
          return (
            <DataTableFacetedFilter
              column={column}
              title={columnMeta.label ?? column.id}
              options={columnMeta.options ?? []}
              multiple
            />
          )

        default:
          return null
      }
    }, [column, columnMeta, locale])

    return onFilterRender()
  }
}
