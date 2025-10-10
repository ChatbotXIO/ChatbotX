"use client"

import {
  type OrganizationModel,
  organizationSettingsSchema,
} from "@aha.chat/database/types"
import { generateAuthUrl } from "@aha.chat/integration-zalo"
import { Button } from "@aha.chat/ui/components/ui/button"
import { redirect, useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

export type ZaloConnectProps = {
  organization: OrganizationModel
}

export function ZaloConnect({ organization }: ZaloConnectProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const [currentUrl, setCurrentUrl] = useState<string>("")

  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [])

  const connectZalo = () => {
    const { data: setting } = organizationSettingsSchema.safeParse(
      organization.settings,
    )

    if (!setting?.zalo) {
      toast.error("Organization settings are not valid")
      return
    }

    const redirectUrl = new URL(
      "/integrations/zalo/callback",
      currentUrl,
    ).toString()

    const redirectUri = generateAuthUrl({
      ...setting.zalo,
      redirectUrl,
      stateParams: {
        chatbotId,
        referer: currentUrl,
      },
    })

    redirect(redirectUri)
  }

  return (
    <Button onClick={connectZalo} type="button" variant="secondary">
      {t("actions.connect")}
    </Button>
  )
}
