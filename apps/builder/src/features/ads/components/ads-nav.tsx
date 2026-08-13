"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { MousePointerClickIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"

type AdsNavLink = {
  label: string
  segment: string
}

type AdsNavGroup = {
  label: string
  links: AdsNavLink[]
}

/**
 * Secondary left navigation for the Ads section. Currently a single
 * "Click to WhatsApp Ads" group. The grouped shape is kept so more channels
 * (e.g. TikTok) or providers can be appended without reworking the render.
 */
export function AdsNav() {
  const t = useTranslations()
  const pathname = usePathname()
  const workspaceId = useWorkspaceId()

  const base = `/space/${workspaceId}/ads`

  const groups: AdsNavGroup[] = [
    {
      label: t("ads.nav.clickToWhatsappAds"),
      links: [
        { label: t("ads.nav.connectAccounts"), segment: "connect-accounts" },
        // Conversion Events is hidden from the menu for now (not surfaced to
        // users). Re-add this link to show it again — the page/route still exists.
        { label: t("ads.nav.adsAnalytics"), segment: "analytics" },
      ],
    },
  ]

  return (
    <nav aria-label={t("ads.title")} className="w-56 shrink-0">
      {groups.map((group) => (
        <div className="mb-6" key={group.label}>
          <div className="mb-2 flex items-center gap-2 px-2 font-medium text-foreground text-sm">
            <MousePointerClickIcon className="size-4 shrink-0" />
            <span>{group.label}</span>
          </div>
          <ul className="flex flex-col">
            {group.links.map((link) => {
              const href = `${base}/${link.segment}`
              const isActive = pathname.startsWith(href)
              return (
                <li key={link.segment}>
                  <Link
                    className={cn(
                      "block rounded-md px-3 py-1.5 text-sm transition-colors",
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
        </div>
      ))}
    </nav>
  )
}
