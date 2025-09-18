"use client"

import type {
  OrganizationModel,
  OrganizationSettings,
} from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { redirect, useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { generateAuthUrl } from "../libs/zalo"
import { validateOrganizationSettingSchema } from "../schemas"

export type ZaloConnectProps = {
  organization: OrganizationModel
}

export function ZaloConnect({ organization }: ZaloConnectProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const connectZalo = () => {
    const organizationSettings =
      organization?.settings as unknown as OrganizationSettings
    const { data: setting } =
      validateOrganizationSettingSchema.safeParse(organizationSettings)

    if (!setting) {
      throw new Error("Organization settings are not valid")
    }

    const redirectUrl = new URL(
      "/integrations/zalo/callback",
      process.env.NEXT_PUBLIC_BUILDER_URL,
    ).toString()
    const clientId = setting.zalo.clientId as string
    const clientSecret = setting.zalo.clientSecret as string
    const version = setting.zalo.version as string
    const redirectUri = generateAuthUrl({
      clientId,
      clientSecret,
      version,
      redirectUrl,
      stateParams: {
        chatbotId,
        referer: `${process.env.NEXT_PUBLIC_BUILDER_URL}/chatbots/${chatbotId}/settings/channels`,
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
