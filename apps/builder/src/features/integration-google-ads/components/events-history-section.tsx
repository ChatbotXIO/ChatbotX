"use client"

import {
  type GoogleAdsEventStatus,
  googleAdsEventStatusValues,
} from "@chatbotx.io/database/partials"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useId, useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { retryGoogleAdsEventAction } from "../actions/retry-event.action"
import { useInvalidateGoogleAds } from "../hooks/use-invalidate-google-ads"
import { eventStatusLabelKey } from "../lib/status"
import { EventsTable } from "./events-table"
import { NoticeAlert } from "./notice-alert"
import { SettingsSection } from "./settings-section"

const EVENTS_PER_PAGE = 20
const ALL_STATUSES = "all"
const SKELETON_ROWS = ["a", "b", "c"]

type StatusFilter = GoogleAdsEventStatus | typeof ALL_STATUSES

type EventsHistorySectionProps = {
  workspaceId: string
  /** The workspace has a Google Ads connection, so the section shows even before the first conversion. */
  isConnected: boolean
}

/**
 * Recent conversions. Events outlive the connection, so a disconnected
 * workspace still sees its history, but only once there is something to show.
 */
export const EventsHistorySection = ({
  workspaceId,
  isConnected,
}: EventsHistorySectionProps) => {
  const t = useTranslations()
  const router = useRouter()
  const invalidate = useInvalidateGoogleAds()
  const filterId = useId()
  const [status, setStatus] = useState<StatusFilter>(ALL_STATUSES)
  const [page, setPage] = useState(1)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const events = useQuery(
    orpc.googleAdsAPI.listEvents.queryOptions({
      input: {
        workspaceId,
        page,
        perPage: EVENTS_PER_PAGE,
        status: status === ALL_STATUSES ? undefined : status,
      },
    }),
  )

  const { execute: retry } = useAction(
    retryGoogleAdsEventAction.bind(null, workspaceId),
    {
      onSuccess: async () => {
        setRetryingId(null)
        await invalidate()
        router.refresh()
      },
      onError: ({ error }) => {
        setRetryingId(null)
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const isFiltered = status !== ALL_STATUSES
  const hasEvents = (events.data?.total ?? 0) > 0
  // Without a connection there is nothing to explain until an event exists;
  // a pending or failed query proves nothing, so it keeps its own states.
  const isKnownEmpty = events.isSuccess && !(hasEvents || isFiltered)
  if (!isConnected && isKnownEmpty) {
    return null
  }
  const totalPages = events.data
    ? Math.max(1, Math.ceil(events.data.total / events.data.perPage))
    : 1

  const renderBody = () => {
    if (events.isPending) {
      return (
        <div
          className="flex flex-col gap-2"
          data-testid="google-ads-events-loading"
        >
          {SKELETON_ROWS.map((row) => (
            <Skeleton className="h-9 w-full" key={row} />
          ))}
        </div>
      )
    }
    if (events.isError) {
      return (
        <NoticeAlert
          actions={
            <Button
              onClick={() => events.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("actions.retry")}
            </Button>
          }
          tone="destructive"
        >
          {t("googleAds.events.loadError")}
        </NoticeAlert>
      )
    }
    if (events.data.data.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          {t(
            isFiltered
              ? "googleAds.events.emptyFiltered"
              : "googleAds.events.empty",
          )}
        </p>
      )
    }
    return (
      <EventsTable
        events={events.data.data}
        onRetry={(eventId) => {
          setRetryingId(eventId)
          retry({ eventId })
        }}
        retryingId={retryingId}
      />
    )
  }

  return (
    <SettingsSection
      actions={
        <>
          <Link
            className={buttonVariants({ size: "sm", variant: "link" })}
            href={`/space/${workspaceId}/dashboard/ads/google`}
          >
            {t("googleAds.stats.viewStatistics")}
          </Link>
          {hasEvents || isFiltered ? (
            <div className="flex items-center gap-2">
              <Label id={filterId}>{t("googleAds.events.filter.label")}</Label>
              <Select
                items={[
                  {
                    value: ALL_STATUSES,
                    label: t("googleAds.events.filter.all"),
                  },
                  ...googleAdsEventStatusValues.map((value) => ({
                    value,
                    label: t(eventStatusLabelKey[value]),
                  })),
                ]}
                onValueChange={(value) => {
                  setStatus(String(value) as StatusFilter)
                  setPage(1)
                }}
                value={status}
              >
                <SelectTrigger aria-labelledby={filterId} size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>
                    {t("googleAds.events.filter.all")}
                  </SelectItem>
                  {googleAdsEventStatusValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(eventStatusLabelKey[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </>
      }
      description={t("googleAds.events.description")}
      title={t("googleAds.events.title")}
    >
      {renderBody()}
      {events.data && events.data.total > events.data.perPage ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">
            {t("googleAds.events.page", { page, pages: totalPages })}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("actions.prev")}
            </Button>
            <Button
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("actions.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </SettingsSection>
  )
}
