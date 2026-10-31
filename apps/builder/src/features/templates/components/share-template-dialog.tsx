"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo } from "react"
import { toast } from "sonner"
import { getShareSettingsAction } from "../actions/get-share-settings.action"
import { ShareSettingsPanel } from "./share-settings-panel"

type ShareTemplateDialogProps = {
  workspaceId: string
  template: { id: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The template list carries no share token, so the dialog loads the share
 * settings for the chosen template when it opens and again after each change.
 */
export function ShareTemplateDialog({
  workspaceId,
  template,
  open,
  onOpenChange,
}: ShareTemplateDialogProps) {
  const t = useTranslations()
  const templateId = template?.id

  const loadSettings = useMemo(
    () => getShareSettingsAction.bind(null, workspaceId, templateId ?? ""),
    [workspaceId, templateId],
  )
  const {
    execute: load,
    result,
    isPending,
  } = useAction(loadSettings, {
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  useEffect(() => {
    if (open && templateId) {
      load()
    }
  }, [open, templateId, load])

  const settings = result.data?.id === templateId ? result.data : undefined

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("templates.share.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("templates.share.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {settings ? (
          <ShareSettingsPanel
            onChanged={() => load()}
            template={settings}
            workspaceId={workspaceId}
          />
        ) : null}
        {!settings && isPending ? (
          <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : null}

        <DialogFooter className="justify-end">
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
