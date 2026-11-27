"use client"

import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { setInstallationAutoUpdateAction } from "../actions/set-installation-auto-update.action"
import { useRefreshingAction } from "../lib/use-refreshing-action"

type InstallAutoUpdateCellProps = {
  workspaceId: string
  installationId: string
  autoUpdate: boolean
  disabled?: boolean
  id?: string
  label?: string
}

export function InstallAutoUpdateCell({
  workspaceId,
  installationId,
  autoUpdate,
  disabled = false,
  id,
  label,
}: InstallAutoUpdateCellProps) {
  const { execute: executeToggle, isPending: isToggling } = useRefreshingAction(
    setInstallationAutoUpdateAction.bind(null, workspaceId, installationId),
  )

  const toggle = (
    <Switch
      checked={autoUpdate}
      disabled={isToggling || disabled}
      id={id}
      onCheckedChange={(checked) =>
        executeToggle({ autoUpdate: Boolean(checked) })
      }
    />
  )
  if (!label) {
    return toggle
  }
  return (
    <div className="flex items-center gap-2">
      {toggle}
      <Label className="cursor-pointer font-normal" htmlFor={id}>
        {label}
      </Label>
    </div>
  )
}
