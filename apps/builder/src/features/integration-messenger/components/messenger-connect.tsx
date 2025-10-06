"use client"

import type {
  OrganizationModel,
  OrganizationSettings,
} from "@aha.chat/database/types"
import type { FacebookPage } from "@aha.chat/integration-messenger/schemas"
import FacebookLogin, {
  type InitParams,
} from "@greatsumini/react-facebook-login"
import { SiMessenger } from "@icons-pack/react-simple-icons"
import { useParams } from "next/navigation"
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
]

export type MessengerConnectProps = {
  organization: OrganizationModel
}

export function MessengerConnect({ organization }: MessengerConnectProps) {
  const t = useTranslations()

  const settings = organization.settings as OrganizationSettings
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const [pages, setPages] = useState<FacebookPage[]>([])

  const onLoginSuccess = async () => {
    const allPages = await getFacebookPages()
    setPages(allPages)
  }

  return (
    <div className="flex flex-col gap-2">
      {pages.length === 0 && (
        <div className="flex">
          <FacebookLogin
            appId={settings.messenger?.clientId as string}
            className="inline-flex h-8 items-center justify-start gap-2 whitespace-nowrap rounded-md bg-secondary px-4 py-2 font-medium text-secondary-foreground text-sm shadow-xs transition-all hover:bg-secondary/80 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
            initParams={{
              version:
                (settings.messenger?.version as InitParams["version"]) ??
                "v18.0",
            }}
            onFail={(error) => {
              // biome-ignore lint/suspicious/noConsole: debug
              console.log("error", error)
              toast.error(t("connectFailed", { feature: "Messenger" }))
            }}
            onSuccess={() => {
              toast.success(t("connectSuccess", { feature: "Messenger" }))
              onLoginSuccess()
            }}
            scope={MESSENGER_SCOPE.join(",")}
          >
            <SiMessenger className="size-4" fill="#0866FF" />
            {t("actions.connect")}
          </FacebookLogin>
        </div>
      )}
      {pages.length > 0 && (
        <FacebookPages chatbotId={chatbotId} pages={pages} />
      )}
    </div>
  )
}
