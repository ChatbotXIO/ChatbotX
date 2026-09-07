"use client"

import type { InstagramAccount } from "@chatbotx.io/integration-instagram"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import { InstagramAccounts } from "@/features/integration-instagram/components/instagram-accounts"

export type SelectAccountProps = {
  account: InstagramAccount
  workspaceId: string
}

export function SelectAccount({ account, workspaceId }: SelectAccountProps) {
  const t = useTranslations()

  return (
    <Card className={CONNECT_PICKER_CARD_CLASS}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {t("actions.connectFeature", { feature: "Instagram" })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <InstagramAccounts account={account} workspaceId={workspaceId} />
      </CardContent>
    </Card>
  )
}
