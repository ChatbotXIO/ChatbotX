"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { AdsSwitcherData } from "../queries/switcher"
import { AdsAccountSwitcher } from "./ads-account-switcher"

type AdsAccountControlProps = {
  integrations: AdsSwitcherData["integrations"]
  whatsappCredentialPublic: AdsSwitcherData["whatsappCredentialPublic"]
  workspaceId: string
}

export function AdsAccountControl({
  integrations,
  whatsappCredentialPublic,
  workspaceId,
}: AdsAccountControlProps) {
  const t = useTranslations()

  if (integrations.length === 0) {
    return (
      <Link
        className={buttonVariants()}
        href={`/space/${workspaceId}/settings/channels`}
      >
        {t("ads.connectAccounts.connectWhatsapp.cta")}
      </Link>
    )
  }

  return (
    <AdsAccountSwitcher
      integrations={integrations}
      whatsappCredentialPublic={whatsappCredentialPublic}
      workspaceId={workspaceId}
    />
  )
}
