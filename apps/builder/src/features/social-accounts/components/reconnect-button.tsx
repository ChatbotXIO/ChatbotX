"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { reconnectInstagramAction } from "@/features/integration-instagram/actions/reconnect.action"
import { reconnectMessengerAction } from "@/features/integration-messenger/actions/reconnect.action"
import { reconnectThreadsAction } from "@/features/integration-threads/actions/reconnect.action"
import { reconnectReturnToSchema } from "@/lib/channel-reconnect"
import type { InboxProvider } from "../lib/connections"

const RETURN_TO = reconnectReturnToSchema.enum.postsConnect

type ViewProps = {
  disabled: boolean
  /** Shown as a tooltip on the button, never as a paragraph. */
  hint?: string
  isPending: boolean
  label: string
  name: string
  onClick: () => void
}

const ReconnectButtonView = ({
  disabled,
  hint,
  isPending,
  label,
  name,
  onClick,
}: ViewProps) => {
  const t = useTranslations()
  const button = (
    <Button
      aria-label={t("posts.connect.reconnectName", { label, name })}
      disabled={disabled || isPending}
      onClick={onClick}
      size="sm"
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : null}
      {label}
    </Button>
  )
  if (!hint) {
    return button
  }
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  )
}

type ReconnectProps = {
  disabled: boolean
  integrationId: string
  label: string
  name: string
  workspaceId: string
}

/** Every reconnect ends in a redirect to the network's login dialog, so there is no onSuccess. */
const useReportReconnectError = () => {
  const t = useTranslations()
  return ({ error }: { error: { serverError?: string } }) =>
    toast.error(error.serverError ?? t("messages.errorLoadingData"))
}

/** The existing channel reconnect action of each inbox provider. */
const RECONNECT_ACTIONS = {
  facebook: reconnectMessengerAction,
  instagram: reconnectInstagramAction,
  threads: reconnectThreadsAction,
} as const satisfies Record<InboxProvider, unknown>

/**
 * Reconnects the inbox behind a destination with the existing channel
 * reconnect action and returns to the Connect tab. Instagram's action picks the
 * Instagram Login or Facebook Login dialog from the integration itself.
 */
export const ReconnectButton = ({
  provider,
  ...props
}: ReconnectProps & { provider: InboxProvider }) => {
  const t = useTranslations()
  const onError = useReportReconnectError()
  const { execute, isPending } = useAction(
    RECONNECT_ACTIONS[provider].bind(
      null,
      props.workspaceId,
      props.integrationId,
      RETURN_TO,
    ),
    { onError },
  )
  return (
    <ReconnectButtonView
      disabled={props.disabled}
      // Only Facebook needs a word on what the reconnect asks for.
      hint={
        provider === "facebook"
          ? t("posts.connect.facebookReconnectHint")
          : undefined
      }
      isPending={isPending}
      label={props.label}
      name={props.name}
      onClick={() => execute()}
    />
  )
}
