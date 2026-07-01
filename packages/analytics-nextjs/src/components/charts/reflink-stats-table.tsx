"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useLocale, useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatDateWithYear } from "../../utils/date-format"

export function ReflinkStatsTable() {
  const t = useTranslations("analytics")
  const locale = useLocale()
  const refLinkStats = useAnalysisStore((state) => state.refLinkStats)

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {refLinkStats.length > 0 ? (
            refLinkStats.map((row) => (
              <TableRow key={row.dateReport}>
                <TableCell>
                  {formatDateWithYear(new Date(row.dateReport), locale)}
                </TableCell>
                <TableCell>{row.count}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={2}>
                {t("noResults")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
