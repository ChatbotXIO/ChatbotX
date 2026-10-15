"use client"

import type { inboundWebhookRequestStatuses } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { parseAsInteger, useQueryState } from "nuqs"
import { useState, useTransition } from "react"
import type { z } from "zod"
import { getInboundWebhookRequestAction } from "../actions/get-inbound-webhook-request.action"
import type {
  inboundWebhookRequestDetailResource,
  inboundWebhookRequestSummaryResource,
} from "../schema/public"

type RequestSummary = z.infer<typeof inboundWebhookRequestSummaryResource>
type RequestDetail = z.infer<typeof inboundWebhookRequestDetailResource>
type RequestStatus = z.infer<typeof inboundWebhookRequestStatuses>

const STATUS_VARIANT: Record<
  RequestStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  received: "outline",
  processing: "outline",
  processed: "default",
  completedWithErrors: "secondary",
  skipped: "secondary",
  failed: "destructive",
}

type RootTranslator = ReturnType<typeof useTranslations>

/**
 * The catalog message at `key`, or `fallback` when there is none — codes the
 * worker may record that this build has no label for.
 */
const translateOr = (
  t: RootTranslator,
  key: string,
  fallback: string,
): string => {
  const messageKey = key as Parameters<RootTranslator>[0]
  return t.has(messageKey) ? t(messageKey) : fallback
}

type InboundWebhookRequestsPanelProps = {
  workspaceId: string
  inboundWebhookId: string
  requests: RequestSummary[]
  page: number
  pageCount: number
}

export const InboundWebhookRequestsPanel = ({
  workspaceId,
  inboundWebhookId,
  requests,
  page,
  pageCount,
}: InboundWebhookRequestsPanelProps) => {
  const t = useTranslations("inboundWebhooks.requests")
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const [, setPage] = useQueryState(
    "requestsPage",
    parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          <Button
            disabled={isRefreshing}
            onClick={() => startRefresh(() => router.refresh())}
            type="button"
            variant="outline"
          >
            <RefreshCwIcon
              aria-hidden
              className={isRefreshing ? "size-4 animate-spin" : "size-4"}
            />
            {t("refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {requests.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {requests.map((request) => (
              <RequestRow
                inboundWebhookId={inboundWebhookId}
                key={`${request.id}:${request.status}`}
                request={request}
                workspaceId={workspaceId}
              />
            ))}
          </ul>
        )}
        {pageCount > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              aria-label={t("previous")}
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronLeftIcon aria-hidden className="size-4" />
            </Button>
            <span className="text-muted-foreground text-sm">
              {t("pageOf", { page, pageCount })}
            </span>
            <Button
              aria-label={t("next")}
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronRightIcon aria-hidden className="size-4" />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

const RequestRow = ({
  workspaceId,
  inboundWebhookId,
  request,
}: {
  workspaceId: string
  inboundWebhookId: string
  request: RequestSummary
}) => {
  const t = useTranslations("inboundWebhooks.requests")
  const tRoot = useTranslations()
  const format = useFormatter()
  const [expanded, setExpanded] = useState(false)
  const { execute, result, isPending } = useAction(
    getInboundWebhookRequestAction.bind(
      null,
      workspaceId,
      inboundWebhookId,
      request.id,
    ),
  )

  const errorCodeLabel = (code: string | null): string | null =>
    code
      ? translateOr(tRoot, `inboundWebhooks.requests.errorCode.${code}`, code)
      : null
  const reason = request.skipReason
    ? t(`skipReason.${request.skipReason}`)
    : (request.errorMessage ?? errorCodeLabel(request.errorCode))

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant={STATUS_VARIANT[request.status]}>
          {t(`status.${request.status}`)}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {format.dateTime(new Date(request.receivedAt), {
            dateStyle: "medium",
            timeStyle: "medium",
          })}
        </span>
        {request.contactId ? (
          <span className="text-xs">
            {t("contact", { id: request.contactId })}
          </span>
        ) : null}
        <Button
          aria-expanded={expanded}
          className="ms-auto"
          onClick={() => {
            const next = !expanded
            setExpanded(next)
            if (next && !result.data) {
              execute()
            }
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {expanded ? t("hideDetails") : t("showDetails")}
        </Button>
      </div>
      {reason ? (
        <p className="break-words text-muted-foreground text-xs">{reason}</p>
      ) : null}
      {expanded ? (
        <RequestDetailView
          detail={result.data}
          error={result.serverError}
          isPending={isPending}
        />
      ) : null}
    </li>
  )
}

const RequestDetailView = ({
  detail,
  error,
  isPending,
}: {
  detail: RequestDetail | undefined
  error: string | undefined
  isPending: boolean
}) => {
  const t = useTranslations("inboundWebhooks.requests")
  const tRoot = useTranslations()
  const actionReasonLabel = (reason: string): string =>
    translateOr(
      tRoot,
      `inboundWebhooks.requests.actionSkipReason.${reason}`,
      reason,
    )
  const actionLabel = (type: string): string =>
    translateOr(tRoot, `trigger.actions.${type}`, type)

  if (isPending) {
    return (
      <p className="text-muted-foreground text-xs">{t("loadingDetails")}</p>
    )
  }
  if (error || !detail) {
    return (
      <p className="text-destructive text-xs" role="alert">
        {error ?? t("detailsFailed")}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {detail.fieldErrors?.length ? (
        <div>
          <p className="font-medium text-xs">{t("fieldErrors")}</p>
          <ul className="list-disc ps-5 text-muted-foreground text-xs">
            {detail.fieldErrors.map((fieldError) => (
              <li key={`${fieldError.target}-${fieldError.code}`}>
                {fieldError.target}: {t(`fieldErrorCode.${fieldError.code}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail.actionResults?.length ? (
        <div>
          <p className="font-medium text-xs">{t("actionResults")}</p>
          <ul className="list-disc ps-5 text-muted-foreground text-xs">
            {detail.actionResults.map((result) => (
              <li key={result.index}>
                {actionLabel(result.type)}: {t(`actionStatus.${result.status}`)}
                {result.reason ? ` (${actionReasonLabel(result.reason)})` : ""}
                {result.error ? ` — ${result.error}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <p className="font-medium text-xs">{t("payload")}</p>
        <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
          {JSON.stringify(detail.payload, null, 2)}
        </pre>
      </div>
    </div>
  )
}
