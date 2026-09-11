"use client"

import type { CommentAutomationErrorRow } from "@chatbotx.io/analytics"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatDateWithYear } from "../../utils/date-format"
import { AnalyticsTableCard } from "./analytics-table-card"

const SEARCH_DEBOUNCE_MS = 300

function getFullName(contact: CommentAutomationErrorRow["contact"]): string {
  if (!contact) {
    return "-"
  }
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ")
  return name || "-"
}

function getInitial(contact: CommentAutomationErrorRow["contact"]): string {
  return contact?.firstName?.[0]?.toUpperCase() ?? "?"
}

/**
 * Mirrors the workspace Error Logs table (Type / Description / Contact / Date)
 * but scoped to one automation. The contact cell is rendered inline rather than
 * with the builder's `ContactNameCell`: this component lives in a package and
 * cannot import from `apps/builder`.
 */
export function CommentAutomationErrorLogsTable() {
  const t = useTranslations()
  const locale = useLocale()

  const rows = useAnalysisStore((state) => state.commentAutomationErrors)
  const page = useAnalysisStore((state) => state.commentAutomationErrorsPage)
  const pageCount = useAnalysisStore(
    (state) => state.commentAutomationErrorsPageCount,
  )
  const pageSize = useAnalysisStore(
    (state) => state.commentAutomationErrorsPerPage,
  )
  const total = useAnalysisStore((state) => state.commentAutomationErrorsTotal)
  const loading = useAnalysisStore((state) => state.loading)
  const setPage = useAnalysisStore(
    (state) => state.setCommentAutomationErrorsPage,
  )
  const setPageSize = useAnalysisStore(
    (state) => state.setCommentAutomationErrorsPerPage,
  )
  const setKeyword = useAnalysisStore(
    (state) => state.setCommentAutomationErrorsKeyword,
  )

  const [draftKeyword, setDraftKeyword] = useState("")
  // One request per settled search, not per keystroke — the same 300ms the
  // shared `useDataTable` toolbar uses.
  const applyKeyword = useDebouncedCallback(setKeyword, SEARCH_DEBOUNCE_MS)

  const replyChannelLabel = (replyChannel: string) =>
    replyChannel === "public"
      ? t("analytics.publicReply")
      : t("analytics.privateReply")

  return (
    <AnalyticsTableCard
      loading={loading}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      page={page}
      pageCount={pageCount}
      pageSize={pageSize}
      search={{
        value: draftKeyword,
        placeholder: t("actions.search"),
        onChange: (value) => {
          setDraftKeyword(value)
          applyKeyword(value)
        },
      }}
      title={t("errorLogs.title")}
      total={total}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fields.type.label")}</TableHead>
            <TableHead>{t("fields.description.label")}</TableHead>
            <TableHead>{t("fields.contact.label")}</TableHead>
            <TableHead>{t("analytics.date")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{replyChannelLabel(row.replyChannel)}</TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <div className="max-w-100 truncate">
                          {row.errorDetail ?? "-"}
                        </div>
                      }
                    />
                    <TooltipContent>
                      <p className="max-w-96">{row.errorDetail ?? "-"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-8">
                      <AvatarImage src={row.contact?.avatar ?? undefined} />
                      <AvatarFallback>{getInitial(row.contact)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">
                      {getFullName(row.contact)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {formatDateWithYear(new Date(row.occurredAt), locale)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={4}>
                {t("analytics.noResults")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </AnalyticsTableCard>
  )
}
