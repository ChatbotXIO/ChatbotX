"use client"

import type { OrganizationSettings } from "@aha.chat/database/types"
import { generateAuthUrl } from "@aha.chat/integration-zalo"
import { Button } from "@aha.chat/ui/components/ui/button"
import { RedirectType, redirect } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

export type ZaloConnectProps = {
  chatbotId?: string | null
  settings: NonNullable<OrganizationSettings["zalo"]>
}

export function ZaloConnect({ chatbotId, settings }: ZaloConnectProps) {
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
        chatbotId,
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
