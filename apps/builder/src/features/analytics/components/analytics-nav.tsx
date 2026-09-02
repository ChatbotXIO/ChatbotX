"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import type { AdsEligibleChannelType } from "@chatbotx.io/utils/channel"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"

type AnalyticsNavLink = {
  label: string
  segment: string
}

/**
 * Secondary left navigation inside the Analytics section, mirroring the
 * former AdsNav pattern: Contacts / Conversations / Ads sub-pages.
 *
 * One Ads Analytics menu entry per channel in `adsChannels` (Click-to-WhatsApp /
 * Click-to-Messenger / Click-to-Instagram), each opening
 * `/dashboard/ads/<channel>` scoped to that channel. Callers resolve which
 * channels a workspace actually has integrated (see
 * `resolveAdsDashboardChannels`) — an empty array renders no Ads entries.
 */
export function AnalyticsNav({
  adsChannels,
}: {
  adsChannels: readonly AdsEligibleChannelType[]
}) {
  const t = useTranslations()
  const pathname = usePathname()
  const workspaceId = useWorkspaceId()

  const base = `/space/${workspaceId}/dashboard`

  const links: AnalyticsNavLink[] = [
    { label: t("analytics.contacts"), segment: "contacts" },
    { label: t("analytics.conversations"), segment: "conversations" },
    ...adsChannels.map((channel) => ({
      label: t(`ads.dashboardNav.${channel}`),
      segment: `ads/${channel}`,
    })),
  ]

  return (
    <nav aria-label={t("fields.analytics.label")} className="w-56 shrink-0">
      <ul className="flex flex-col gap-1">
        {links.map((link) => {
          const href = `${base}/${link.segment}`
          const isActive = pathname.startsWith(href)
          return (
            <li key={link.segment}>
              <Link
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                href={href}
              >
                {link.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
