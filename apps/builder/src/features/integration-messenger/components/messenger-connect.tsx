"use client"

import type { MessengerCredentialPublic } from "@chatbotx.io/database/partials"
import type { FacebookPage } from "@chatbotx.io/integration-messenger/schema"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import FacebookLogin, {
  type InitParams,
} from "@greatsumini/react-facebook-login"
import { useTranslations } from "next-intl"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
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
  "business_management",
]

export type MessengerConnectProps = {
  workspaceId?: string | null
  publicConfig: MessengerCredentialPublic
  trigger?: ReactNode
}

export function MessengerConnect({
  workspaceId,
  publicConfig,
  trigger,
}: MessengerConnectProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [pages, setPages] = useState<FacebookPage[]>([])

  const onLoginSuccess = async () => {
    const allPages = await getFacebookPages()
    setPages(allPages)
    setOpen(true)
  }

  const handleOpenChange = (value: boolean) => {
    setOpen(value)
    if (!value) {
      setPages([])
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <MessengerConnectButton
          onLoginSuccess={onLoginSuccess}
          publicConfig={publicConfig}
          trigger={trigger}
        />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("actions.connectFeature", { feature: "Messenger" })}
          </DialogTitle>
        </DialogHeader>
        {pages.length && (
          <FacebookPages
            onSuccess={() => setOpen(false)}
            pages={pages}
            workspaceId={workspaceId}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

export function MessengerConnectButton({
  publicConfig,
  onLoginSuccess,
  trigger,
}: {
  publicConfig: MessengerCredentialPublic
  trigger?: ReactNode
  onLoginSuccess: () => Promise<void>
}) {
  const t = useTranslations()

  return (
    <FacebookLogin
      appId={publicConfig.clientId}
      className="inline-flex h-8 items-center justify-start gap-2 whitespace-nowrap rounded-md bg-secondary px-4 py-2 font-medium text-secondary-foreground text-sm shadow-xs transition-all hover:bg-secondary/80 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
      initParams={{
        version: (publicConfig.version as InitParams["version"]) ?? "v18.0",
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
      {trigger ?? (
        <InboxIcon channel="messenger" label={t("actions.connect")} />
      )}
    </FacebookLogin>
  )
}
