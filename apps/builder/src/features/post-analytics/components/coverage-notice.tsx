"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { InfoIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import type { PostAnalyticsCoverageResponse } from "../schema"

const TITLE_KEY = {
  full: "fullTitle",
  none: "noneTitle",
  partial: "partialTitle",
} as const satisfies Record<PostAnalyticsCoverageResponse["level"], string>

/**
 * Says what the numbers cover. Growth history starts when tracking started, so
 * an empty or short chart is "not measured yet", never "no activity".
 */
export const CoverageNotice = ({
  coverage,
}: {
  coverage: PostAnalyticsCoverageResponse | undefined
}) => {
  const t = useTranslations("posts.analytics.coverage")
  const format = useFormatter()
  if (!coverage || (coverage.level === "full" && !coverage.truncated)) {
    return null
  }
  const since = coverage.trackingSince
    ? format.dateTime(new Date(`${coverage.trackingSince}T00:00:00`), {
        dateStyle: "medium",
      })
    : null
  return (
    <Alert>
      <InfoIcon aria-hidden="true" />
      <AlertTitle className="line-clamp-none">
        {t(TITLE_KEY[coverage.level])}
      </AlertTitle>
      <AlertDescription>
        <p>{since ? t("since", { date: since }) : t("sinceUnknown")}</p>
        {coverage.level === "none" ? null : (
          <p>
            {t("withHistory", {
              posts: coverage.posts,
              withHistory: coverage.postsWithHistory,
            })}
          </p>
        )}
        {coverage.truncated ? <p>{t("truncated")}</p> : null}
      </AlertDescription>
    </Alert>
  )
}
