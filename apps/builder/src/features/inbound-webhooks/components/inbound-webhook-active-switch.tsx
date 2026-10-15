"use client"

import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { updateInboundWebhookSettingsAction } from "../actions/update-inbound-webhook-settings.action"
import { translateInboundWebhookError } from "../lib/server-error"

type InboundWebhookActiveSwitchProps = {
  workspaceId: string
  id: string
  name: string
  active: boolean
  disabled?: boolean
}

/**
 * Optimistic toggle. Activation is refused server-side while the config is
 * incomplete (no inbox, identity or mapping yet), so a failure rolls the switch back
 * and surfaces the reason.
 */
export const InboundWebhookActiveSwitch = ({
  workspaceId,
  id,
  name,
  active,
  disabled,
}: InboundWebhookActiveSwitchProps) => {
  const t = useTranslations()
  const router = useRouter()
  const [checked, setChecked] = useState(active)

  useEffect(() => setChecked(active), [active])

  const { execute, isPending } = useAction(
    updateInboundWebhookSettingsAction.bind(null, workspaceId, id),
    {
      onSuccess: () => router.refresh(),
      onError: ({ error }) => {
        setChecked(active)
        toast.error(
          translateInboundWebhookError(
            t,
            error.serverError,
            t("inboundWebhooks.feature"),
          ),
        )
      },
    },
  )

  return (
    <Switch
      aria-label={t("inboundWebhooks.activeToggle", { name })}
      checked={checked}
      disabled={disabled || isPending}
      onCheckedChange={(next) => {
        setChecked(next)
        execute({ active: next })
      }}
    />
  )
}
