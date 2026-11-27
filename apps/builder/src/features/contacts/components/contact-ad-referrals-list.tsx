"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Loader2Icon, MegaphoneIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { channelLabel } from "@/features/inboxes/lib/channel-label"
import { orpc } from "@/lib/orpc/query"
import { toHttpUrl } from "../lib/http-url"
import type { ContactAdReferralResource } from "../schema/ad-referral"

const AD_REFERRALS_PER_PAGE = 20

const AdReferralRow = ({
  referral,
}: {
  referral: ContactAdReferralResource
}) => {
  const t = useTranslations()
  const formatter = useFormatter()
  const href = toHttpUrl(referral.sourceUrl)
  // A Google click read from a channel with no ad id has nothing to name.
  const name =
    referral.title ??
    referral.adId ??
    (referral.provider === "google"
      ? t("condition.fields.fromGoogleAd")
      : t("condition.fields.fromCtwaAd"))
  const content = (
    <>
      <MegaphoneIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        {referral.title && referral.adId ? (
          <div className="truncate font-mono text-muted-foreground text-xs">
            {referral.adId}
          </div>
        ) : null}
        <div className="truncate text-muted-foreground">
          {formatter.dateTime(referral.occurredAt, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
      </div>
      <Badge className="shrink-0" variant="outline">
        {channelLabel(referral.channel)}
      </Badge>
    </>
  )

  return href ? (
    <a
      className="flex items-start gap-2 rounded-md border p-2 transition-colors hover:bg-muted"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <div className="flex items-start gap-2 rounded-md border p-2">
      {content}
    </div>
  )
}

/**
 * Every ad the contact came from, newest first. Fetched only once the section
 * is opened, a page at a time, so it costs nothing for contacts nobody opens.
 */
export const ContactAdReferralsList = ({
  workspaceId,
  contactId,
}: {
  workspaceId: string
  contactId: string
}) => {
  const t = useTranslations()
  const referrals = useInfiniteQuery(
    orpc.contactsAPIs.listContactAdReferralsAuthenticatedAPI.infiniteOptions({
      input: (cursor: string | undefined) => ({
        workspaceId,
        contactId,
        perPage: AD_REFERRALS_PER_PAGE,
        cursor,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  )

  if (referrals.isPending) {
    return (
      <div className="flex justify-center px-2 py-4">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // A failed next page keeps the pages already loaded; only a failed first
  // load has nothing to show.
  if (referrals.isError && !referrals.data) {
    return (
      <div className="flex items-center gap-2 px-2 text-muted-foreground text-sm">
        <span>{t("messages.errorLoadingData")}</span>
        <Button
          onClick={() => referrals.refetch()}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("actions.retry")}
        </Button>
      </div>
    )
  }

  const rows = referrals.data.pages.flatMap((page) => page.data)
  if (rows.length === 0) {
    return (
      <div className="px-2 text-muted-foreground text-sm">
        {t("contactAdReferrals.empty")}
      </div>
    )
  }

  return (
    <div className="grid gap-2 px-2 text-sm">
      {rows.map((referral) => (
        <AdReferralRow key={referral.id} referral={referral} />
      ))}
      {referrals.isFetchNextPageError ? (
        <p className="text-destructive text-xs" role="alert">
          {t("messages.errorLoadingData")}
        </p>
      ) : null}
      {referrals.hasNextPage ? (
        <Button
          disabled={referrals.isFetchingNextPage}
          onClick={() => referrals.fetchNextPage()}
          size="sm"
          type="button"
          variant="ghost"
        >
          {referrals.isFetchingNextPage ? (
            <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          <span
            className={referrals.isFetchingNextPage ? "sr-only" : undefined}
          >
            {referrals.isFetchNextPageError
              ? t("actions.retry")
              : t("actions.loadMore")}
          </span>
        </Button>
      ) : null}
    </div>
  )
}
