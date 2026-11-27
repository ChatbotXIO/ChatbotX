"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import {
  type AnalyticsSectionId,
  type AnalyticsSectionOption,
  analyticsSectionOption,
  resolveActiveAnalyticsSection,
} from "../lib/analytics-sections"
import {
  sharedFilterParsers,
  withSharedFilters,
} from "../lib/shared-filter-params"

type Translator = ReturnType<typeof useTranslations>

/**
 * Every section label as a static literal key, so the i18n audit sees each one
 * and a new section fails to compile until it has a label.
 */
function sectionLabels(t: Translator): Record<AnalyticsSectionId, string> {
  return {
    contacts: t("analytics.contacts"),
    conversations: t("analytics.conversations"),
    posts: t("analytics.sections.posts"),
    "ads-whatsapp": t("ads.dashboardNav.whatsapp"),
    "ads-messenger": t("ads.dashboardNav.messenger"),
    "ads-instagram": t("ads.dashboardNav.instagram"),
    "ads-google": t("ads.dashboardNav.google"),
  }
}

/**
 * Switches between the Analytics dashboard's sections (Contacts, Conversations,
 * Posts, Ads). The sections are resolved on the server (permissions and
 * connected channels) and passed in as plain data; the active one follows the
 * pathname, and for a super-admin a deep-linked section the list leaves out (a
 * since-disconnected ads channel) is appended so the value is never blank; a
 * member who may not see that section gets no such row (its page is a 404).
 * Switching carries the
 * shared Channel / Inbox selection (and nothing else) to the next section.
 * Navigating shows the workspace route skeleton, so no spinner here.
 */
export function AnalyticsSectionSelect({
  sections,
  canAppendUnlisted,
}: {
  sections: readonly AnalyticsSectionOption[]
  /** Super-admins only: append a deep-linked section the list leaves out. */
  canAppendUnlisted: boolean
}) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const [filters] = useQueryStates(sharedFilterParsers)
  const current = resolveActiveAnalyticsSection(pathname)
  if (!current) {
    return null
  }

  const isListed = sections.some((section) => section.id === current.section.id)
  const listed =
    isListed || !canAppendUnlisted
      ? sections
      : [...sections, analyticsSectionOption(current.section.id)]
  const labels = sectionLabels(t)
  const items = listed.map((section) => ({
    value: section.id,
    label: labels[section.id],
  }))

  const onChange = (value: unknown) => {
    const next = listed.find((section) => section.id === value)
    if (next && next.id !== current.section.id) {
      router.push(
        withSharedFilters(`${current.base}/${next.segment}`, {
          channels: filters.channels,
          inboxIds: filters.inboxIds,
        }),
      )
    }
  }

  return (
    <Select items={items} onValueChange={onChange} value={current.section.id}>
      <SelectTrigger
        aria-label={t("fields.analytics.label")}
        className="w-full"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
