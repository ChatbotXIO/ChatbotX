"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { reinstallTemplateAction } from "../actions/reinstall-template.action"
import { updateInstallationAutoUpdateAction } from "../actions/update-installation-auto-update.action"

type InstallAutoUpdateCellProps = {
  workspaceId: string
  installationId: string
  autoUpdate: boolean
  updateAvailable: boolean
}

export function InstallAutoUpdateCell({
  workspaceId,
  installationId,
  autoUpdate,
  updateAvailable,
}: InstallAutoUpdateCellProps) {
  const t = useTranslations()
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

  const { execute: executeReinstall, isPending: isReinstalling } = useAction(
    reinstallTemplateAction.bind(null, workspaceId, installationId),
    {
      onSuccess: () => {
        toast.success(t("templates.installs.updateStarted"))
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={autoUpdate}
        disabled={isToggling}
        onCheckedChange={(checked) => executeToggle({ autoUpdate: checked })}
      />
      {updateAvailable ? (
        <Button
          disabled={isReinstalling}
          onClick={() => executeReinstall()}
          size="sm"
          variant="outline"
        >
          {isReinstalling && <Loader2Icon className="animate-spin" />}
          {t("templates.installs.updateNow")}
        </Button>
      ) : null}
    </div>
  )
}
