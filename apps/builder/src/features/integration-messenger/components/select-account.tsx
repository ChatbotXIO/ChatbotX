"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import type { MessengerPickerItem } from "@/features/integration-messenger/components/messenger-pages"
import { MessengerPages } from "@/features/integration-messenger/components/messenger-pages"

type SelectPageProps = {
  items: MessengerPickerItem[]
  bmLookupFailed: boolean
  workspaceId: string
}

export function SelectPage({
  items,
  bmLookupFailed,
  workspaceId,
}: SelectPageProps) {
  const t = useTranslations()

  return (
    <Card className={CONNECT_PICKER_CARD_CLASS}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {t("actions.connectFeature", { feature: "Messenger" })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {bmLookupFailed && (
          <Alert variant="warning">
            <AlertTitle>
              {t("messenger.selectPage.bmLookupFailedTitle")}
            </AlertTitle>
            <AlertDescription>
              {t("messenger.selectPage.bmLookupFailedDescription")}
            </AlertDescription>
          </Alert>
        )}
        <MessengerPages items={items} workspaceId={workspaceId} />
      </CardContent>
    </Card>
  )
}
