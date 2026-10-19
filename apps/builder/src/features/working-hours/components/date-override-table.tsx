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
import { PencilIcon, Trash2Icon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { formatRanges } from "../lib/date-override-state"

type DateOverrideRow = {
  date: string
  name: string | null
  ranges: readonly { startMinute: number; endMinute: number }[]
}

/** Read-only list of dates with edit/delete actions; the owner decides how they persist. */
export function DateOverrideTable<Row extends DateOverrideRow>({
  rows,
  emptyLabel,
  disabled,
  onEdit,
  onDelete,
}: {
  rows: readonly Row[]
  emptyLabel: string
  disabled: boolean
  onEdit: (row: Row) => void
  onDelete: (row: Row) => void
}) {
  const t = useTranslations()
  const format = useFormatter()

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fields.date.label")}</TableHead>
            <TableHead>{t("fields.name.label")}</TableHead>
            <TableHead>{t("workingHours.dateDialog.hours")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.date}>
                <TableCell className="whitespace-nowrap font-medium">
                  {format.dateTime(new Date(`${row.date}T00:00:00Z`), {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  })}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.name || "—"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {row.ranges.length === 0
                    ? t("workingHours.dateDialog.closed")
                    : formatRanges(row.ranges)}
                </TableCell>
                <TableCell className="w-1 whitespace-nowrap">
                  <Button
                    aria-label={t("actions.edit")}
                    disabled={disabled}
                    onClick={() => onEdit(row)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    aria-label={t("actions.delete")}
                    disabled={disabled}
                    onClick={() => onDelete(row)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                className="h-20 text-center text-muted-foreground"
                colSpan={4}
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
