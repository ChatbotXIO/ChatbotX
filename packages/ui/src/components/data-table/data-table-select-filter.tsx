"use client"

import type { Column } from "@tanstack/react-table"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import type { Option } from "@chatbotx.io/ui/types/data-table"

const ALL_VALUE = "__all__"

interface DataTableSelectFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title?: string
  options: Option[]
}

export function DataTableSelectFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableSelectFilterProps<TData, TValue>) {
  const columnFilterValue = column?.getFilterValue()
  const selectedValue = Array.isArray(columnFilterValue)
    ? columnFilterValue[0]
    : columnFilterValue

  const items = [{ label: title, value: ALL_VALUE }, ...options]

  return (
    <Select
      items={items}
      onValueChange={(value) =>
        column?.setFilterValue(value === ALL_VALUE ? undefined : [value])
      }
      value={typeof selectedValue === "string" ? selectedValue : ALL_VALUE}
    >
      <SelectTrigger className="h-8 w-40" size="sm">
        <SelectValue placeholder={title} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{title}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
