"use client"

import type {
  CommentModerationAction,
  CommentModerationCategory,
  CommentModerationRule,
  CommentModerationSource,
  CommentModerationStatus,
} from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useQuery } from "@tanstack/react-query"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { orpc } from "@/lib/orpc/query"

const PER_PAGE = 20
const ALL = "all"

const actionLabelKeys = {
  hide: "commentAutomation.moderationLog.actions.hide",
  delete: "commentAutomation.moderationLog.actions.delete",
} as const satisfies Record<CommentModerationAction, string>

const sourceLabelKeys = {
  rule: "commentAutomation.moderationLog.sources.rule",
  ai: "commentAutomation.moderationLog.sources.ai",
} as const satisfies Record<CommentModerationSource, string>

const statusLabelKeys = {
  pending: "commentAutomation.moderationLog.statuses.pending",
  done: "commentAutomation.moderationLog.statuses.done",
  failed: "commentAutomation.moderationLog.statuses.failed",
} as const satisfies Record<CommentModerationStatus, string>

const ruleLabelKeys = {
  all: "commentAutomation.moderationLog.rules.all",
  phoneNumber: "commentAutomation.moderationLog.rules.phoneNumber",
  link: "commentAutomation.moderationLog.rules.link",
  keyword: "commentAutomation.moderationLog.rules.keyword",
  image: "commentAutomation.moderationLog.rules.image",
  video: "commentAutomation.moderationLog.rules.video",
  gif: "commentAutomation.moderationLog.rules.gif",
  emoji: "commentAutomation.moderationLog.rules.emoji",
} as const satisfies Record<CommentModerationRule, string>

const categoryLabelKeys = {
  hate: "commentAutomation.aiModeration.categories.hate",
  offensive: "commentAutomation.aiModeration.categories.offensive",
  harassment: "commentAutomation.aiModeration.categories.harassment",
  negative: "commentAutomation.aiModeration.categories.negative",
  spam: "commentAutomation.aiModeration.categories.spam",
} as const satisfies Record<CommentModerationCategory, string>

/**
 * "Moderated comments" on the per-automation analytics page: every comment
 * this automation hid or deleted, and why — the hide rule that matched, or the
 * AI's categories and reason. Reads the same procedure family as the public
 * `commentAutomations.listModerationLogs`.
 */
export function ModerationLogCard({
  workspaceId,
  automationId,
}: {
  workspaceId: string
  automationId: string
}) {
  const t = useTranslations()
  const format = useFormatter()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<CommentModerationAction | typeof ALL>(
    ALL,
  )
  const [source, setSource] = useState<CommentModerationSource | typeof ALL>(
    ALL,
  )

  const filter = {
    workspaceId,
    id: automationId,
    action: action === ALL ? undefined : action,
    source: source === ALL ? undefined : source,
  }
  const summary = useQuery(
    orpc.commentAutomationsAPI.moderationSummaryAPI.queryOptions({
      input: filter,
    }),
  )
  const logs = useQuery(
    orpc.commentAutomationsAPI.moderationLogsAPI.queryOptions({
      input: { ...filter, page, perPage: PER_PAGE },
    }),
  )

  const actionOptions = [
    { value: ALL, label: t("commentAutomation.moderationLog.allActions") },
    ...(["hide", "delete"] as const).map((value) => ({
      value,
      label: t(actionLabelKeys[value]),
    })),
  ]
  const sourceOptions = [
    { value: ALL, label: t("commentAutomation.moderationLog.allSources") },
    ...(["rule", "ai"] as const).map((value) => ({
      value,
      label: t(sourceLabelKeys[value]),
    })),
  ]

  const rows = logs.data?.data ?? []
  const pageCount = logs.data?.pageCount ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("commentAutomation.moderationLog.title")}</CardTitle>
        <CardDescription>
          {t("commentAutomation.moderationLog.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.data && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">
              {t("commentAutomation.moderationLog.summary.total", {
                count: summary.data.total,
              })}
            </Badge>
            <Badge variant="outline">
              {t("commentAutomation.moderationLog.summary.hidden", {
                count: summary.data.hidden,
              })}
            </Badge>
            <Badge variant="outline">
              {t("commentAutomation.moderationLog.summary.deleted", {
                count: summary.data.deleted,
              })}
            </Badge>
            <Badge variant="outline">
              {t("commentAutomation.moderationLog.summary.byAI", {
                count: summary.data.byAI,
              })}
            </Badge>
            <Badge variant="outline">
              {t("commentAutomation.moderationLog.summary.byRule", {
                count: summary.data.byRule,
              })}
            </Badge>
            {summary.data.failed > 0 && (
              <Badge variant="destructive">
                {t("commentAutomation.moderationLog.summary.failed", {
                  count: summary.data.failed,
                })}
              </Badge>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Select
            items={actionOptions}
            onValueChange={(value) => {
              setAction(value as typeof action)
              setPage(1)
            }}
            value={action}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={sourceOptions}
            onValueChange={(value) => {
              setSource(value as typeof source)
              setPage(1)
            }}
            value={source}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t("commentAutomation.moderationLog.columns.time")}
                </TableHead>
                <TableHead>
                  {t("commentAutomation.moderationLog.columns.contact")}
                </TableHead>
                <TableHead>
                  {t("commentAutomation.moderationLog.columns.comment")}
                </TableHead>
                <TableHead>
                  {t("commentAutomation.moderationLog.columns.action")}
                </TableHead>
                <TableHead>
                  {t("commentAutomation.moderationLog.columns.reason")}
                </TableHead>
                <TableHead>
                  {t("commentAutomation.moderationLog.columns.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    className="text-center text-muted-foreground"
                    colSpan={6}
                  >
                    {logs.isLoading
                      ? t("commentAutomation.moderationLog.loading")
                      : t("commentAutomation.moderationLog.empty")}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {format.dateTime(new Date(row.occurredAt), {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    {row.fullName ??
                      row.sourceId ??
                      t("commentAutomation.moderationLog.unknownContact")}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-pre-wrap break-words">
                    {row.commentText ??
                      t("commentAutomation.moderationLog.noText")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge
                        variant={
                          row.action === "delete" ? "destructive" : "secondary"
                        }
                      >
                        {t(actionLabelKeys[row.action])}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {t(sourceLabelKeys[row.source])}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {row.source === "ai" ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {row.categories.map((category) => (
                            <Badge key={category} variant="outline">
                              {t(categoryLabelKeys[category])}
                            </Badge>
                          ))}
                        </div>
                        {row.reason && (
                          <p className="text-muted-foreground text-xs">
                            {row.reason}
                          </p>
                        )}
                      </div>
                    ) : (
                      row.rule && (
                        <span>
                          {t(ruleLabelKeys[row.rule])}
                          {row.matchedKeyword && `: "${row.matchedKeyword}"`}
                        </span>
                      )
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        row.status === "failed" ? "text-destructive" : undefined
                      }
                      title={row.errorDetail ?? undefined}
                    >
                      {t(statusLabelKeys[row.status])}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              size="sm"
              variant="outline"
            >
              {t("commentAutomation.moderationLog.previous")}
            </Button>
            <span className="text-muted-foreground text-sm">
              {t("commentAutomation.moderationLog.page", {
                page,
                pageCount,
              })}
            </span>
            <Button
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
              size="sm"
              variant="outline"
            >
              {t("commentAutomation.moderationLog.next")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
