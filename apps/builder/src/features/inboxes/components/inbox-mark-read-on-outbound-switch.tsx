"use client"

import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { updateMarkReadOnOutboundAction } from "../actions/update-mark-read-on-outbound.action"
import { useInboxes, useInvalidateInboxes } from "../provider/inbox-hook"

type InboxMarkReadOnOutboundSwitchProps = {
  workspaceId: string
  inboxId: string
}

export function InboxMarkReadOnOutboundSwitch({
  workspaceId,
  inboxId,
}: InboxMarkReadOnOutboundSwitchProps) {
  const t = useTranslations()
  const { data: inboxes, isLoading } = useInboxes(workspaceId)
  const invalidateInboxes = useInvalidateInboxes()
  const inbox = inboxes?.find((item) => item.id === inboxId)
  const isInboxAvailable = inbox !== undefined
  const enabled = inbox?.markReadOnOutbound ?? false
  const switchId = `mark-read-on-outbound-${inboxId}`

  const { execute, isPending } = useAction(
    updateMarkReadOnOutboundAction.bind(null, workspaceId, inboxId),
    {
      onSuccess: () => {
        invalidateInboxes()
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("inboxes.markReadOnOutbound.label"),
          }),
        )
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )

  return (
    <div className="flex items-center gap-2">
      <Switch
        aria-label={t("inboxes.markReadOnOutbound.label")}
        checked={enabled}
        disabled={isLoading || isPending || !isInboxAvailable}
        id={switchId}
        onCheckedChange={(nextEnabled) => execute({ enabled: nextEnabled })}
      />
      <Label htmlFor={switchId}>
        {enabled
          ? t("inboxes.markReadOnOutbound.enabled")
          : t("inboxes.markReadOnOutbound.disabled")}
      </Label>
    </div>
  )
}
