"use client"

import type { OrganizationSettings } from "@chatbotx.io/database/partials"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import FacebookLogin, {
  type InitParams,
} from "@greatsumini/react-facebook-login"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { getInstagramAccounts, type InstagramAccount } from "../libs/facebook"
import { InstagramAccounts } from "./instagram-accounts"

const INSTAGRAM_SCOPE = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_manage_metadata",
  "pages_show_list",
  "pages_messaging",
  "pages_read_engagement",
  "business_management",
]

export type InstagramConnectProps = {
  workspaceId?: string | null
  settings: NonNullable<OrganizationSettings["instagram"]>
}

export function InstagramConnect({
  workspaceId,
  settings,
}: InstagramConnectProps) {
  const t = useTranslations()

  const [accounts, setAccounts] = useState<InstagramAccount[]>([])

  const onLoginSuccess = async () => {
    const allAccounts = await getInstagramAccounts()
    setAccounts(allAccounts)
  }

  return (
    <Card className="mx-auto mt-40 w-lg">
      <CardHeader>
        <CardTitle>
          {t("actions.connectFeature", { feature: "Instagram" })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 && (
          <InstagramConnectButton
            onLoginSuccess={onLoginSuccess}
            settings={settings}
          />
        )}
        {accounts.length > 0 && (
          <InstagramAccounts accounts={accounts} workspaceId={workspaceId} />
        )}
      </CardContent>
    </Card>
  )
}

export function InstagramConnectButton({
  settings,
  onLoginSuccess,
}: {
  settings: NonNullable<OrganizationSettings["instagram"]>
  onLoginSuccess: () => Promise<void>
}) {
  const t = useTranslations()

  return (
    <FacebookLogin
      appId={settings.clientId as string}
      className="inline-flex h-8 items-center justify-start gap-2 whitespace-nowrap rounded-md bg-secondary px-4 py-2 font-medium text-secondary-foreground text-sm shadow-xs transition-all hover:bg-secondary/80 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
      initParams={{
        version: (settings.version as InitParams["version"]) ?? "v21.0",
      }}
      onFail={(error) => {
        console.log("error", error)
        toast.error(t("messages.connectFailed", { feature: "Instagram" }))
      }}
      onSuccess={() => {
        toast.success(t("messages.connectSuccess", { feature: "Instagram" }))
        onLoginSuccess()
      }}
      scope={INSTAGRAM_SCOPE.join(",")}
    >
      <InboxIcon channel="instagram" label={t("actions.connect")} />
    </FacebookLogin>
  )
}
