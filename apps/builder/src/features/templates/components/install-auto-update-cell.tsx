"use client"

import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { updateInstallationAutoUpdateAction } from "../actions/update-installation-auto-update.action"

type InstallAutoUpdateCellProps = {
  workspaceId: string
  installationId: string
  autoUpdate: boolean
}

export function InstallAutoUpdateCell({
  workspaceId,
  installationId,
  autoUpdate,
}: InstallAutoUpdateCellProps) {
  const router = useRouter()

  const { execute: executeToggle, isPending: isToggling } = useAction(
    updateInstallationAutoUpdateAction.bind(null, workspaceId, installationId),
    {
      onSuccess: () => router.refresh(),
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Switch
      checked={autoUpdate}
      disabled={isToggling}
      onCheckedChange={(checked) => executeToggle({ autoUpdate: checked })}
    />
  )
}
