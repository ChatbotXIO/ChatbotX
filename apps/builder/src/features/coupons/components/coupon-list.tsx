"use client"

import {
  couponIssueStatuses,
  couponUsageStatuses,
} from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import type { CouponResource } from "@/features/coupons/schemas/resource"
import { client } from "@/lib/orpc/orpc"
import { ExportCouponDialog } from "./export-coupon-dialog"
import { ImportCouponDialog } from "./import-coupon-dialog"

type CouponListProps = {
  workspaceId: string
}

export function CouponList({ workspaceId }: CouponListProps) {
  const t = useTranslations()
  const formatter = useFormatter()
  const [rows, setRows] = useState<CouponResource[]>([])
  const [topicId, setTopicId] = useState("")
  const [issueStatus, setIssueStatus] = useState("")
  const [usageStatus, setUsageStatus] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const perPage = 50
  const [pageCount, setPageCount] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const { options: topicOptions } = useCouponTopicOptions()

  const filter = useMemo(
    () => ({
      topicId: topicId || undefined,
      issueStatus: issueStatus
        ? couponIssueStatuses.parse(issueStatus)
        : undefined,
      usageStatus: usageStatus
        ? couponUsageStatuses.parse(usageStatus)
        : undefined,
      search: search || undefined,
    }),
    [issueStatus, search, topicId, usageStatus],
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const couponResult = await client.couponsAPI.listCouponsAPI({
        workspaceId,
        ...filter,
        page,
        perPage,
      })
      setRows(couponResult.data)
      setPageCount(couponResult.pageCount)
      setTotal(couponResult.total)
    } finally {
      setIsLoading(false)
    }
  }, [filter, page, workspaceId])

  useEffect(() => {
    load().catch((error) =>
      toast.error(error instanceof Error ? error.message : t("messages.error")),
    )
  }, [load, t])

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            onChange={(event) => {
              setPage(1)
              setTopicId(event.target.value)
            }}
            value={topicId}
          >
            <option value="">{t("coupons.fields.allTopics")}</option>
            {topicOptions.map((topic) => (
              <option key={topic.value} value={topic.value}>
                {topic.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            onChange={(event) => {
              setPage(1)
              setIssueStatus(event.target.value)
            }}
            value={issueStatus}
          >
            <option value="">{t("coupons.fields.allIssueStatuses")}</option>
            <option value={couponIssueStatuses.enum.published}>
              {t("coupons.issueStatuses.published")}
            </option>
            <option value={couponIssueStatuses.enum.unpublished}>
              {t("coupons.issueStatuses.unpublished")}
            </option>
          </select>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            onChange={(event) => {
              setPage(1)
              setUsageStatus(event.target.value)
            }}
            value={usageStatus}
          >
            <option value="">{t("coupons.fields.allUsageStatuses")}</option>
            <option value={couponUsageStatuses.enum.used}>
              {t("coupons.usageStatuses.used")}
            </option>
            <option value={couponUsageStatuses.enum.notUsed}>
              {t("coupons.usageStatuses.notUsed")}
            </option>
          </select>
          <Input
            className="w-56"
            onChange={(event) => {
              setPage(1)
              setSearch(event.target.value)
            }}
            placeholder={t("coupons.fields.searchCode")}
            value={search}
          />
          {search ? (
            <Button
              onClick={() => {
                setPage(1)
                setSearch("")
              }}
              size="sm"
              variant="outline"
            >
              <XIcon className="size-4" />
              {t("actions.reset")}
            </Button>
          ) : null}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <ImportCouponDialog onStarted={load} workspaceId={workspaceId} />
          <ExportCouponDialog filter={filter} workspaceId={workspaceId} />
        </div>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("coupons.fields.topic")}</TableHead>
              <TableHead>{t("coupons.fields.code")}</TableHead>
              <TableHead>{t("coupons.fields.issueStatus")}</TableHead>
              <TableHead>{t("coupons.fields.usageStatus")}</TableHead>
              <TableHead>{t("fields.createdAt.label")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.topicName}</TableCell>
                <TableCell className="font-mono text-sm">{row.code}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {t(`coupons.issueStatuses.${row.issueStatus}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={row.usedAt ? "default" : "secondary"}>
                    {t(`coupons.usageStatuses.${row.usageStatus}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {formatter.dateTime(new Date(row.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  {isLoading
                    ? t("actions.loading")
                    : t("coupons.messages.empty")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
        <div className="text-muted-foreground">
          {t("analytics.total")}: {total.toLocaleString()}
        </div>
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {t("analytics.pagination.pageOf", { page, pageCount })}
            </span>
            <Button
              aria-label={t("analytics.pagination.previousPage")}
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              size="icon"
              variant="outline"
            >
              <ChevronLeftIcon className="size-4 rtl:rotate-180" />
            </Button>
            <Button
              aria-label={t("analytics.pagination.nextPage")}
              disabled={page >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              size="icon"
              variant="outline"
            >
              <ChevronRightIcon className="size-4 rtl:rotate-180" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
