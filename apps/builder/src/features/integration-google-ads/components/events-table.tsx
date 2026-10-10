"use client"

import type {
  GoogleAdsEventStatus,
  GoogleAdsUploadMethod,
} from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
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
import { Loader2Icon, RotateCcwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  channelLabel,
  eventStatusLabelKey,
  eventStatusTone,
  failureStageLabelKey,
  processingStatusLabelKey,
  uploadMethodLabelKey,
} from "../lib/status"
import type { GoogleAdsEventResource } from "../schema/events"
import {
  ConsentSnapshotCell,
  CustomerPropertiesCell,
  DedupCell,
  MatchingCell,
  ProvidedTimeMarker,
} from "./events-table-cells"
import { RelativeTime } from "./relative-time"
import { StatusBadge } from "./status-badge"

type EventRow = {
  id: string
  status: GoogleAdsEventStatus
  failureStage: keyof typeof failureStageLabelKey | null
  processingStatus: keyof typeof processingStatusLabelKey | null
  error: string | null
  channel: string
  uploadMethod: GoogleAdsUploadMethod
  conversionActionName: string | null
  maskedClickId: string
  occurredAt: Date
  identity: GoogleAdsEventResource["identity"]
  conversionTimeProvided: boolean
  consentSnapshot: GoogleAdsEventResource["consentSnapshot"]
  customerMatching: GoogleAdsEventResource["customerMatching"]
  customerProperties: GoogleAdsEventResource["customerProperties"]
}

type EventsTableProps = {
  events: EventRow[]
  retryingId: string | null
  onRetry: (eventId: string) => void
}

/** Compact, horizontally scrollable table of recent conversions; Retry only on failed rows. */
export const EventsTable = ({
  events,
  retryingId,
  onRetry,
}: EventsTableProps) => {
  const t = useTranslations()
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableCaption className="sr-only">
          {t("googleAds.events.title")}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">
              {t("googleAds.events.columns.status")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.events.columns.action")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.events.columns.dedup")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.events.columns.channel")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.events.columns.clickId")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.events.columns.occurredAt")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.events.columns.consent")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.events.columns.matching")}
            </TableHead>
            <TableHead scope="col">
              {t("googleAds.events.columns.properties")}
            </TableHead>
            <TableHead className="text-end" scope="col">
              <span className="sr-only">
                {t("googleAds.events.columns.actions")}
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge tone={eventStatusTone[event.status]}>
                      {t(eventStatusLabelKey[event.status])}
                    </StatusBadge>
                    {event.failureStage ? (
                      <Badge variant="outline">
                        {t(failureStageLabelKey[event.failureStage])}
                      </Badge>
                    ) : null}
                    {event.processingStatus ? (
                      <Badge variant="outline">
                        {t(processingStatusLabelKey[event.processingStatus])}
                      </Badge>
                    ) : null}
                  </div>
                  {event.error ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            className="block max-w-56 truncate rounded-sm text-start text-destructive text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            type="button"
                          />
                        }
                      >
                        {event.error}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-80">
                        {event.error}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>{event.conversionActionName ?? "—"}</TableCell>
              <TableCell>
                <DedupCell identity={event.identity} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span>{channelLabel(event.channel)}</span>
                  {event.uploadMethod === "legacy" ? (
                    <span className="text-muted-foreground text-xs">
                      {t(uploadMethodLabelKey.legacy)}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {event.maskedClickId}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <RelativeTime date={event.occurredAt} />
                {event.conversionTimeProvided ? <ProvidedTimeMarker /> : null}
              </TableCell>
              <TableCell>
                <ConsentSnapshotCell snapshot={event.consentSnapshot} />
              </TableCell>
              <TableCell className="text-xs">
                <MatchingCell matching={event.customerMatching} />
              </TableCell>
              <TableCell className="text-xs">
                <CustomerPropertiesCell properties={event.customerProperties} />
              </TableCell>
              <TableCell className="text-end">
                {event.status === "failed" ? (
                  <Button
                    disabled={retryingId === event.id}
                    onClick={() => onRetry(event.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {retryingId === event.id ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    ) : (
                      <RotateCcwIcon aria-hidden="true" />
                    )}
                    {t("actions.retry")}
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
