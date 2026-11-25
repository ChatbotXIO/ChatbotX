"use client"

import type { SocialProvider } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { SOCIAL_PROVIDER_CAPABILITIES } from "@chatbotx.io/utils/social-account"
import { CheckCircle2Icon, Loader2Icon, PlugZapIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { connectSocialAccountAction } from "../actions/connect-social-account.action"

/**
 * Runs the network's login dialog. One connect grants every page the person
 * manages, so every Connect and Reconnect button on the page is this one
 * action for the page's network, never a per-page flow.
 */
export const ConnectButton = ({
  connectable,
  connectedCount = 0,
  disabled,
  label,
  provider,
  variant,
  workspaceId,
}: {
  /** The owner configured this network's publishing app. */
  connectable: boolean
  connectedCount?: number
  disabled: boolean
  label: string
  provider: SocialProvider
  variant: "default" | "outline"
  workspaceId: string
}) => {
  const t = useTranslations()
  const supported =
    provider === "tiktok" &&
    SOCIAL_PROVIDER_CAPABILITIES[provider].connectSupported &&
    connectable
  const { execute, isPending } = useAction(
    connectSocialAccountAction.bind(null, workspaceId, "tiktok"),
    {
      onError: ({ error }) =>
        toast.error(error.serverError ?? t("messages.errorLoadingData")),
    },
  )

  const isConnected = connectedCount > 0
  let title: string | undefined
  if (!supported) {
    title = t("posts.connect.comingSoon")
  } else if (isConnected) {
    title = t("posts.connect.connectedAlready", { count: connectedCount })
  }
  let icon = <PlugZapIcon />
  if (isPending) {
    icon = <Loader2Icon className="animate-spin" />
  } else if (isConnected) {
    icon = (
      <CheckCircle2Icon className="text-emerald-700 dark:text-emerald-400" />
    )
  }

  return (
    <Button
      disabled={disabled || !supported || isPending}
      onClick={() => execute()}
      size="sm"
      title={title}
      variant={variant}
    >
      {icon}
      {label}
    </Button>
  )
}
