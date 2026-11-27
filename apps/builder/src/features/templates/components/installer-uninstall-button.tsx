"use client"

import type { TemplateUninstallState } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import {
  previewUninstallInstallerAction,
  uninstallInstallerAction,
} from "../actions/uninstall-installer.action"
import { UninstallDialog } from "./uninstall-dialog"
import {
  isUninstallInProgress,
  uninstallActionLabelKey,
} from "./uninstall-state"

type InstallerUninstallButtonProps = {
  workspaceId: string
  templateId: string
  publisherRef: string
  /** The installer has not allowed the publisher to uninstall: shown, but inert. */
  disabled?: boolean
  /** The state of the latest uninstall of this installer; in progress disables the button. */
  uninstallState?: TemplateUninstallState
  onRequested?: () => void
}

export function InstallerUninstallButton({
  workspaceId,
  templateId,
  publisherRef,
  disabled = false,
  uninstallState,
  onRequested,
}: InstallerUninstallButtonProps) {
  const inProgress = isUninstallInProgress(uninstallState)
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const preview = useMemo(
    () =>
      previewUninstallInstallerAction.bind(
        null,
        workspaceId,
        templateId,
        publisherRef,
      ),
    [workspaceId, templateId, publisherRef],
  )
  const uninstall = useMemo(
    () =>
      uninstallInstallerAction.bind(
        null,
        workspaceId,
        templateId,
        publisherRef,
      ),
    [workspaceId, templateId, publisherRef],
  )

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-block">
              <Button disabled size="sm" variant="ghost">
                <Trash2Icon />
                {t("templates.uninstall.action")}
              </Button>
            </span>
          }
        />
        <TooltipContent>
          {t("templates.installers.uninstallNotAllowed")}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <>
      <Button
        disabled={inProgress}
        onClick={() => setOpen(true)}
        size="sm"
        variant="ghost"
      >
        <Trash2Icon />
        {t(uninstallActionLabelKey(uninstallState))}
      </Button>
      <UninstallDialog
        onOpenChange={setOpen}
        onRequested={onRequested}
        open={open}
        preview={preview}
        uninstall={uninstall}
      />
    </>
  )
}
