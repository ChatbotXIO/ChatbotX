"use client"

import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import type { ReactNode } from "react"
import { AnalyticsTablePagination } from "./analytics-table-pagination"

export type AnalyticsTableSearch = {
  value: string
  placeholder: string
  onChange: (value: string) => void
}

/**
 * Card shell every analytics table sits in, so the tables read as siblings of
 * the `AreaChart` above them (which is a `Card` + `ChartHeader` too) instead of
 * bare bordered boxes.
 *
 * Owns the three pieces that were being repeated per table: the titled header
 * with an optional search box, the bordered table well, and the footer pager.
 */
export function AnalyticsTableCard({
  title,
  search,
  page,
  pageCount,
  pageSize,
  total,
  loading,
  onPageChange,
  onPageSizeChange,
  children,
}: {
  title: string
  search?: AnalyticsTableSearch
  page: number
  pageCount: number
  pageSize: number
  total: number
  loading: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {search && (
          <CardAction>
            <Input
              className="w-56"
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              value={search.value}
            />
          </CardAction>
        )}
      </CardHeader>

      <CardContent>
        <div className="overflow-hidden rounded-md border">{children}</div>
      </CardContent>

      <CardFooter>
        <AnalyticsTablePagination
          loading={loading}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          total={total}
        />
      </CardFooter>
    </Card>
  )
}
