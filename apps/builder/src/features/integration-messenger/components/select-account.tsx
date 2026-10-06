"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import { MessengerPages } from "@/features/integration-messenger/components/messenger-pages"

type SelectPageProps = {
  sessionId: string
  items: ConnectPickerItem[]
  workspaceId: string
}

export function SelectPage({ sessionId, items, workspaceId }: SelectPageProps) {
  const t = useTranslations()

  return (
    <Card className={CONNECT_PICKER_CARD_CLASS}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {t("actions.connectFeature", { feature: "Messenger" })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <MessengerPages
          items={items}
          sessionId={sessionId}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
