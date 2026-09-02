"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { MESSAGING_ADS_TOOL_INTEGRATION_PARAM } from "../lib/tool-path"
import type { MessagingAdsToolIntegration } from "../queries/tool-integrations"

/**
 * Integration select for the Click to Message Ads tool — mirrors
 * `AdsAccountFilter` (`features/ads/components/ads-account-filter.tsx`):
 * URL-driven via `?integration=`, `usePathname`/`useRouter`/`useSearchParams`.
 * Unlike that dashboard filter, there is NO "All accounts" option: the
 * box's auth is per-integration (plan §2), so exactly one integration must
 * always be selected. Rendered inside `MessagingAdsBox` through its
 * `integrationSelector` slot (the toolbar row under the header, opposite the
 * insights date range) and only when the channel has ≥1 eligible
 * integration.
 */
export function MessagingAdsIntegrationFilter({
  integrations,
  selectedIntegrationId,
}: {
  integrations: MessagingAdsToolIntegration[]
  selectedIntegrationId: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()

  const integrationOptions = useMemo(
    () =>
      integrations.map((integration) => ({
        label: integration.name,
        value: integration.id,
      })),
    [integrations],
  )

  const pushIntegration = (integrationId: string) => {
    const params = new URLSearchParams(searchParams)
    params.set(MESSAGING_ADS_TOOL_INTEGRATION_PARAM, integrationId)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Select
      items={integrationOptions}
      onValueChange={(value) => pushIntegration(value as string)}
      value={selectedIntegrationId}
    >
      <SelectTrigger
        aria-label={t("ads.conversionEvents.selectIntegration")}
        className="w-auto min-w-56"
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {integrationOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
