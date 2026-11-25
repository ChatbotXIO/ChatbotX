"use client"

import type { SocialProvider } from "@chatbotx.io/database/partials"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { usePublishDestinations } from "@/features/social-posts/hooks/use-publish-destinations"
import { toInboxNetworkGroups } from "../lib/connections"
import {
  ConnectLoadError,
  ConnectNetworkSection,
} from "./connect-network-section"
import { ConnectResultBanner } from "./connect-result-banner"
import { TikTokPublishingCard } from "./tiktok-publishing-card"

/**
 * The Posts Connect tab: the connected inboxes of Facebook, Instagram and
 * Threads grouped by network, each showing whether it can publish. Only a super
 * admin reconnects; a blocked workspace is read-only.
 */
export const ConnectView = ({
  canManage,
  connectableProviders,
  readOnly,
  workspaceId,
}: {
  canManage: boolean
  connectableProviders: SocialProvider[]
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const destinations = usePublishDestinations(workspaceId)
  const groups = toInboxNetworkGroups(destinations.data?.items ?? [])

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t("posts.connect.title")}</h1>
      <ConnectResultBanner />

      {destinations.isPending ? (
        <ul aria-hidden="true" className="space-y-4">
          {[0, 1].map((index) => (
            <li key={index}>
              <Skeleton className="h-32 w-full rounded-2xl" />
            </li>
          ))}
        </ul>
      ) : null}
      {destinations.isError ? (
        <ConnectLoadError onRetry={() => destinations.refetch()} />
      ) : null}
      {destinations.isSuccess && groups.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-6 text-center">
          <p className="text-muted-foreground text-sm">
            {t("posts.connect.emptyTitle")}
          </p>
          <Link
            className="font-medium text-primary text-sm underline-offset-4 hover:underline focus-visible:underline"
            href={`/space/${workspaceId}/settings/channels`}
          >
            {t("posts.connect.emptyAction")}
          </Link>
        </div>
      ) : null}
      {groups.map((group) => (
        <ConnectNetworkSection
          canManage={canManage}
          group={group}
          key={group.provider}
          readOnly={readOnly}
          workspaceId={workspaceId}
        />
      ))}

      <TikTokPublishingCard
        canManage={canManage}
        connectable={connectableProviders.includes("tiktok")}
        readOnly={readOnly}
        workspaceId={workspaceId}
      />
    </div>
  )
}
