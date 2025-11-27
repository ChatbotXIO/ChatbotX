"use client"

import type { OrganizationSettings } from "@aha.chat/database/types"
import type { FacebookPage } from "@aha.chat/integration-messenger/schemas"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import FacebookLogin, {
  type InitParams,
} from "@greatsumini/react-facebook-login"
import { SiMessenger, SiMessengerHex } from "@icons-pack/react-simple-icons"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { getFacebookPages } from "../libs/facebook"
import { FacebookPages } from "./messenger-pages"

const MESSENGER_SCOPE = [
  "email",
  "public_profile",
  "pages_manage_ads",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "pages_manage_engagement",
  "pages_messaging",
  "pages_show_list",
]

export type MessengerConnectProps = {
  chatbotId?: string | null
  settings: NonNullable<OrganizationSettings["messenger"]>
}

export function MessengerConnect({
  chatbotId,
  settings,
}: MessengerConnectProps) {
  const t = useTranslations()

  const [pages, setPages] = useState<FacebookPage[]>([])

  const onLoginSuccess = async () => {
    const allPages = await getFacebookPages()
    setPages(allPages)
  }

  return (
    <Card className="mx-auto mt-40 w-lg">
      <CardHeader>
        <CardTitle>
          {t("actions.connectFeature", { feature: "Messenger" })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pages.length === 0 && (
          <MessengerConnectButton
            onLoginSuccess={onLoginSuccess}
            settings={settings}
          />
        )}
        {pages.length > 0 && (
          <FacebookPages chatbotId={chatbotId} pages={pages} />
        )}
      </CardContent>
    </Card>
  )
}

export function MessengerConnectButton({
  settings,
  onLoginSuccess,
}: {
  settings: NonNullable<OrganizationSettings["messenger"]>
  onLoginSuccess: () => Promise<void>
}) {
  const t = useTranslations()

  return (
    <FacebookLogin
      appId={settings.clientId as string}
      className="inline-flex h-8 items-center justify-start gap-2 whitespace-nowrap rounded-md bg-secondary px-4 py-2 font-medium text-secondary-foreground text-sm shadow-xs transition-all hover:bg-secondary/80 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
      initParams={{
        version: (settings.version as InitParams["version"]) ?? "v18.0",
      }}
      onFail={(error) => {
        console.log("error", error)
        toast.error(t("messages.connectFailed", { feature: "Messenger" }))
      }}
      onSuccess={() => {
        toast.success(t("messages.connectSuccess", { feature: "Messenger" }))
        onLoginSuccess()
      }}
      scope={MESSENGER_SCOPE.join(",")}
    >
      <SiMessenger className="size-4" fill={SiMessengerHex} />
      {t("actions.connect")}
    </FacebookLogin>
  )
}
