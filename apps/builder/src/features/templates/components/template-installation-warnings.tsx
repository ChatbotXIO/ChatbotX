"use client"

import type { TemplateInstallationWarningGroup } from "@chatbotx.io/business"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useOptionalLabel } from "../lib/use-optional-label"
import { warningLabel } from "../lib/warning-label"

const GROUPS_PER_PAGE = 10

/** One row per affected resource, what happened to it listed under its name. */
export function TemplateInstallationWarnings({
  groups,
}: {
  groups: TemplateInstallationWarningGroup[]
}) {
  const t = useTranslations()
  const categoryLabel = useOptionalLabel("templates.categories")
  const [page, setPage] = useState(1)
  const pageCount = Math.ceil(groups.length / GROUPS_PER_PAGE)
  const shown = groups.slice(
    (page - 1) * GROUPS_PER_PAGE,
    page * GROUPS_PER_PAGE,
  )

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y rounded-md border">
        {shown.map((group) => (
          <li
            className="flex flex-col gap-1 px-3 py-2 text-sm"
            key={`${group.category}|${group.sourceId ?? group.name}`}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium">
                {group.name ?? t("templates.installs.deletedResource")}
              </span>
              <Badge className="flex-none" variant="outline">
                {categoryLabel(group.category)}
              </Badge>
            </span>
            <ul className="text-muted-foreground">
              {group.issues.map((issue) => (
                <li key={issue.code}>
                  {warningLabel(t, issue.code)}
                  {issue.count > 1 ? ` (${issue.count})` : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            size="sm"
            variant="outline"
          >
            {t("actions.prev")}
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {page} / {pageCount}
          </span>
          <Button
            disabled={page === pageCount}
            onClick={() => setPage(page + 1)}
            size="sm"
            variant="outline"
          >
            {t("actions.next")}
          </Button>
        </div>
      )}
    </div>
  )
}
