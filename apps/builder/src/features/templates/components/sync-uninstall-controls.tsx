"use client"

import type { TemplateInstallationDetail as Detail } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon, Trash2Icon, Undo2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  cancelUninstallInstallationAction,
  previewUninstallInstallationAction,
  uninstallInstallationAction,
} from "../actions/uninstall-installation.action"
import { cancelUninstallToasts } from "../lib/cancel-uninstall-toasts"
import { useInvalidateAfterTemplateChange } from "../lib/use-invalidate-template-kinds"
import { useRefreshingAction } from "../lib/use-refreshing-action"
import { UninstallDialog } from "./uninstall-dialog"
import {
  canRetryUninstall,
  isUninstallInProgress,
  uninstallActionLabelKey,
} from "./uninstall-state"

type SyncUninstallControlsProps = {
  workspaceId: string
  detail: Detail
  isBusy: boolean
}

export function SyncUninstallControls({
  workspaceId,
  detail,
  isBusy,
}: SyncUninstallControlsProps) {
  const t = useTranslations()
  const [isOpen, setIsOpen] = useState(false)
  const { invalidateEverything } = useInvalidateAfterTemplateChange()
  const { execute: cancelUninstall, isPending: isCancelling } =
    useRefreshingAction(
      cancelUninstallInstallationAction.bind(null, workspaceId, detail.id),
      {
        onSuccess: async ({ data }) => {
          for (const { level, message } of cancelUninstallToasts(t, data)) {
            toast[level](message)
          }
          // The copies are governed (and locked) by the template again, and
          // re-activated ones come back into the lists they were removed from.
          await invalidateEverything()
        },
      },
    )
  const preview = useMemo(
    () => previewUninstallInstallationAction.bind(null, workspaceId, detail.id),
    [workspaceId, detail.id],
  )
  const uninstall = useMemo(
    () => uninstallInstallationAction.bind(null, workspaceId, detail.id),
    [workspaceId, detail.id],
  )
  const isUninstalling = isUninstallInProgress(detail.uninstallState)

  return (
    <>
      {canRetryUninstall(detail.uninstallState) && (
        <Button
          disabled={isBusy || isCancelling}
          onClick={() => cancelUninstall()}
          size="sm"
          variant="outline"
        >
          {isCancelling ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <Undo2Icon />
          )}
          {t("templates.uninstall.cancelAction")}
        </Button>
      )}
      <Button
        disabled={isBusy}
        onClick={() => setIsOpen(true)}
        size="sm"
        variant="ghost"
      >
        {isUninstalling ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <Trash2Icon />
        )}
        {t(uninstallActionLabelKey(detail.uninstallState))}
      </Button>
      <UninstallDialog
        onOpenChange={setIsOpen}
        open={isOpen}
        preview={preview}
        uninstall={uninstall}
      />
    </>
  )
}
