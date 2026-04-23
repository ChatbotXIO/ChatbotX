"use client"

import type { OrganizationSettings } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-zalo"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { RedirectType, redirect } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

export type ZaloConnectProps = {
  workspaceId?: string | null
  settings: NonNullable<OrganizationSettings["zalo"]>
}

export function ZaloConnect({ workspaceId, settings }: ZaloConnectProps) {
  const t = useTranslations()

  const [currentUrl, setCurrentUrl] = useState<string>("")

  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [])

  const connectZalo = () => {
    const redirectUrl = new URL(
      "/integrations/zalo/callback",
      currentUrl,
    ).toString()

    const redirectUri = generateAuthUrl({
      ...settings,
      redirectUrl,
      stateParams: {
        workspaceId,
        referer: currentUrl,
      },
    })

    redirect(redirectUri, RedirectType.push)
  }

  return (
    <Button onClick={connectZalo} type="button" variant="secondary">
      {t("actions.connect")}
    </Button>
  )
}
