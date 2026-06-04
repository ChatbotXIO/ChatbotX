"use client"

import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import type { ReactElement } from "react"
import { SettingRow } from "@/components/setting-row"

type AiIntegrationConnectProps = {
  connectLabel: string
  connectDescription: string
  autoReplyLabel: string
  autoReplyDescription: string
  isConnected: boolean
  autoReply: boolean
  isToggling: boolean
  onToggleAutoReply: (autoReply: boolean) => void
  /** Connect or disconnect action control, chosen by the owning feature. */
  actionSlot: ReactElement
}

/**
 * Shared settings view for an AI provider integration: a connect/disconnect row
 * plus an auto-reply toggle once connected.
 */
export function AiIntegrationConnect({
  connectLabel,
  connectDescription,
  autoReplyLabel,
  autoReplyDescription,
  isConnected,
  autoReply,
  isToggling,
  onToggleAutoReply,
  actionSlot,
}: AiIntegrationConnectProps) {
  return (
    <div className="flex flex-col space-y-4">
      <SettingRow description={connectDescription} label={connectLabel}>
        {actionSlot}
      </SettingRow>

      {isConnected ? (
        <SettingRow description={autoReplyDescription} label={autoReplyLabel}>
          <div className="flex gap-2">
            <Switch
              checked={autoReply}
              disabled={isToggling}
              onCheckedChange={onToggleAutoReply}
            />
            {isToggling && <Loader2Icon className="size-4 animate-spin" />}
          </div>
        </SettingRow>
      ) : null}
    </div>
  )
}
