"use client"

import type { CommentAutomationErrorRow } from "@chatbotx.io/analytics"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Input } from "@chatbotx.io/ui/components/ui/input"
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
import { AnalyticsTablePagination } from "./analytics-table-pagination"

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
  const loading = useAnalysisStore((state) => state.loading)
  const setPage = useAnalysisStore(
    (state) => state.setCommentAutomationErrorsPage,
  )
  const setKeyword = useAnalysisStore(
    (state) => state.setCommentAutomationErrorsKeyword,
  )

  const [draftKeyword, setDraftKeyword] = useState("")
  // One request per settled search, not per keystroke — same 300ms the shared
  // `useDataTable` toolbar uses.
  const applyKeyword = useDebouncedCallback(setKeyword, SEARCH_DEBOUNCE_MS)

  const replyChannelLabel = (replyChannel: string) =>
    replyChannel === "public"
      ? t("analytics.publicReply")
      : t("analytics.privateReply")

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-sm">{t("errorLogs.title")}</h3>
        <Input
          className="max-w-56"
          onChange={(event) => {
            setDraftKeyword(event.target.value)
            applyKeyword(event.target.value)
          }}
          placeholder={t("actions.search")}
          value={draftKeyword}
        />
      </div>

      <div className="overflow-hidden rounded-md border">
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
                          <div className="max-w-[400px] truncate">
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
                        <AvatarFallback>
                          {getInitial(row.contact)}
                        </AvatarFallback>
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
      </div>

      <AnalyticsTablePagination
        loading={loading}
        onPageChange={setPage}
        page={page}
        pageCount={pageCount}
      />
    </div>
  )
}
