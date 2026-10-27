"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

export type AdminRow = {
  /** Null is the grouped "Automation" actor. */
  userId: string | null
  name: string
  created: number
  won: number
  wonValue: number
  lost: number
  lostValue: number
}

type SortKey = "name" | "created" | "won" | "wonValue" | "lost" | "lostValue"

const COLUMNS = [
  { key: "created", labelKey: "analytics.created" },
  { key: "won", labelKey: "analytics.won" },
  { key: "wonValue", labelKey: "analytics.wonValue" },
  { key: "lost", labelKey: "analytics.lost" },
  { key: "lostValue", labelKey: "analytics.lostValue" },
] as const

type AdminsTableProps = {
  rows: AdminRow[]
  /** Header of the item-count column (the pipeline's plural noun). */
  itemsLabel: string
  money: (value: number) => string
}

const sortIcon = (active: boolean, direction: "asc" | "desc") => {
  if (!active) {
    return <ChevronsUpDownIcon className="size-3.5 opacity-50" />
  }
  return direction === "asc" ? (
    <ArrowUpIcon className="size-3.5" />
  ) : (
    <ArrowDownIcon className="size-3.5" />
  )
}

const ariaSort = (active: boolean, direction: "asc" | "desc") => {
  if (!active) {
    return "none"
  }
  return direction === "asc" ? "ascending" : "descending"
}

export function AdminsTable({ rows, itemsLabel, money }: AdminsTableProps) {
  const t = useTranslations("pipelines")
  const [sortKey, setSortKey] = useState<SortKey>("created")
  const [direction, setDirection] = useState<"asc" | "desc">("desc")

  const sorted = useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) =>
      sortKey === "name"
        ? factor * a.name.localeCompare(b.name)
        : factor * (a[sortKey] - b[sortKey]),
    )
  }, [rows, sortKey, direction])

  const sortBy = (key: SortKey) => {
    if (key === sortKey) {
      setDirection(direction === "asc" ? "desc" : "asc")
      return
    }
    setSortKey(key)
    setDirection(key === "name" ? "asc" : "desc")
  }

  const header = (key: SortKey, label: string, align: "left" | "right") => (
    <TableHead
      aria-sort={ariaSort(key === sortKey, direction)}
      className={align === "right" ? "text-right" : undefined}
      key={key}
    >
      <Button
        className={align === "right" ? "ms-auto -me-2" : "-ms-2"}
        onClick={() => sortBy(key)}
        size="sm"
        variant="ghost"
      >
        {label}
        {sortIcon(key === sortKey, direction)}
      </Button>
    </TableHead>
  )

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {header("name", t("analytics.admin"), "left")}
            {header("created", itemsLabel, "right")}
            {COLUMNS.filter((column) => column.key !== "created").map(
              (column) => header(column.key, t(column.labelKey), "right"),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.userId ?? "automation"}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-right">{row.created}</TableCell>
              <TableCell className="text-right">{row.won}</TableCell>
              <TableCell className="text-right">
                {money(row.wonValue)}
              </TableCell>
              <TableCell className="text-right">{row.lost}</TableCell>
              <TableCell className="text-right">
                {money(row.lostValue)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
