"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import type { InstagramDirectAccount } from "@/features/integration-instagram/components/instagram-accounts"
import { InstagramAccounts } from "@/features/integration-instagram/components/instagram-accounts"

export type SelectAccountProps = {
  sessionId: string
  account: InstagramDirectAccount
  workspaceId: string
}

export function SelectAccount({
  sessionId,
  account,
  workspaceId,
}: SelectAccountProps) {
  const t = useTranslations()

  return (
    <Card className={CONNECT_PICKER_CARD_CLASS}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {t("actions.connectFeature", { feature: "Instagram" })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <InstagramAccounts
          account={account}
          sessionId={sessionId}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
