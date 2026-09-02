"use client"

import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { MegaphoneIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { buildMessagingAdsToolPath } from "../lib/tool-path"

/**
 * Small alert on the old "Ads Optimization" tab (`messenger-capi-tab.tsx` /
 * `instagram-capi-tab.tsx` / `whatsapp-capi-tab.tsx`) pointing at the box's
 * new home — the standalone Click to Message Ads tool. `"use client"`
 * because every one of those tabs is itself a client component, so this
 * needs the client `useTranslations` hook rather than server-only
 * `getTranslations`.
 */
export function MessagingAdsMovedAlert({
  workspaceId,
  channel,
  integrationId,
}: {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
}) {
  const t = useTranslations()

  return (
    <Alert>
      <MegaphoneIcon />
      <AlertTitle>{t("clickToMessageAds.movedNote.title")}</AlertTitle>
      <AlertDescription>
        <p>{t("clickToMessageAds.movedNote.description")}</p>
        <Link
          className={buttonVariants({ size: "sm", variant: "secondary" })}
          href={buildMessagingAdsToolPath({
            workspaceId,
            channel,
            integrationId,
          })}
        >
          {t("clickToMessageAds.movedNote.cta")}
        </Link>
      </AlertDescription>
    </Alert>
  )
}
