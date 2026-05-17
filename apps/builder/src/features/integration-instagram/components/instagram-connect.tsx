"use client"

import type { InstagramCredentialPublic } from "@chatbotx.io/database/partials"
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
  publicConfig: InstagramCredentialPublic
  trigger?: ReactNode
}

export function InstagramConnect({
  workspaceId,
  publicConfig,
  trigger,
}: InstagramConnectProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])

  const onLoginSuccess = async () => {
    const allAccounts = await getInstagramAccounts()
    setAccounts(allAccounts)
    setOpen(true)
  }

  const handleOpenChange = (value: boolean) => {
    setOpen(value)
    if (!value) {
      setAccounts([])
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <InstagramConnectButton
          onLoginSuccess={onLoginSuccess}
          publicConfig={publicConfig}
          trigger={trigger}
        />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("actions.connectFeature", { feature: "Instagram" })}
          </DialogTitle>
        </DialogHeader>
        {accounts.length ? (
          <InstagramAccounts
            accounts={accounts}
            onSuccess={() => setOpen(false)}
            workspaceId={workspaceId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function InstagramConnectButton({
  publicConfig,
  onLoginSuccess,
  trigger,
}: {
  publicConfig: InstagramCredentialPublic
  trigger?: ReactNode
  onLoginSuccess: () => Promise<void>
}) {
  const t = useTranslations()

  return (
    <FacebookLogin
      appId={publicConfig.clientId}
      className="inline-flex h-8 items-center justify-start gap-2 whitespace-nowrap rounded-md bg-secondary px-4 py-2 font-medium text-secondary-foreground text-sm shadow-xs transition-all hover:bg-secondary/80 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
      initParams={{
        version: (publicConfig.version as InitParams["version"]) ?? "v21.0",
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
      {trigger ?? (
        <InboxIcon channel="instagram" label={t("actions.connect")} />
      )}
    </FacebookLogin>
  )
}
