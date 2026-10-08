"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useTransition } from "react"
import { useWorkspaceId } from "@/hooks/routing"

/**
 * Next already logs the server-render failure (with its digest); this view only
 * recovers. `retry()` re-fetches and re-renders the segment. `AnalyticsNav`
 * lives in the page, which no longer renders, so the way back is its own link.
 */
export default function GoogleAdsStatsError({ retry }: { retry: () => void }) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [isPending, startTransition] = useTransition()

  const onRetry = () => startTransition(() => retry())

  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border p-6"
      role="alert"
    >
      <h2 className="font-medium">{t("googleAds.stats.error.title")}</h2>
      <div className="flex flex-wrap gap-2">
        <Button disabled={isPending} onClick={onRetry} type="button">
          {t("googleAds.stats.error.retry")}
        </Button>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={`/space/${workspaceId}/dashboard/contacts`}
        >
          {t("fields.analytics.label")}
        </Link>
      </div>
    </div>
  )
}
