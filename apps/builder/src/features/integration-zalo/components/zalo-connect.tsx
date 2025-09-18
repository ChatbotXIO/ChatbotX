"use client"

import type {
  OrganizationModel,
  OrganizationSettings,
} from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { redirect, useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { generateAuthUrl } from "../libs/zalo"

export type ZaloConnectProps = {
  organization: OrganizationModel
}

export function ZaloConnect({ organization }: ZaloConnectProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const connectZalo = () => {
    const organizationSettings =
      organization.settings as unknown as OrganizationSettings

    if (!organizationSettings) {
      throw new Error("Organization settings not found")
    }
    const redirectUri = new URL(
      "/integrations/zalo/callback",
      process.env.NEXT_PUBLIC_BUILDER_URL,
    ).toString()
    const clientId = organizationSettings.zaloClientId as string
    const clientSecret = organizationSettings.zaloClientSecret as string
    const version = organizationSettings.zaloVersion as string
    const redirectUrl = generateAuthUrl({
      clientId,
      clientSecret,
      version,
      redirectUri,
      stateParams: {
        chatbotId,
        referer: `${process.env.NEXT_PUBLIC_BUILDER_URL}/chatbots/${chatbotId}/settings/channels`,
      },
    })
    redirect(redirectUrl)
  }

  return (
    <Button onClick={connectZalo} type="button" variant="secondary">
      {t("actions.connect")}
    </Button>
  )
}
