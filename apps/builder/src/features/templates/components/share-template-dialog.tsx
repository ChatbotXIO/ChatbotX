"use client"

import type { TemplateModel } from "@chatbotx.io/database/types"
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
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"
import { updateShareSettingsAction } from "../actions/update-share-settings.action"

type ShareTemplateDialogProps = {
  workspaceId: string
  template: TemplateModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShareTemplateDialog({
  workspaceId,
  template,
  open,
  onOpenChange,
}: ShareTemplateDialogProps) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  const [shareEnabled, setShareEnabled] = useState(false)

  useEffect(() => {
    if (template) {
      setShareEnabled(template.shareEnabled)
    }
  }, [template])

  const { execute, isPending } = useAction(
    updateShareSettingsAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", { feature: t("fields.template.label") }),
        )
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
        if (template) {
          setShareEnabled(template.shareEnabled)
        }
      },
    },
  )

  if (!template) {
    return (
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="max-w-lg" />
      </Dialog>
    )
  }

  const shareUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/t/${template.shareToken}`

  const toggleShareEnabled = (checked: boolean) => {
    setShareEnabled(checked)
    execute({ templateId: template.id, shareEnabled: checked })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("templates.share.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("templates.share.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="template-share-enabled">
              {t("templates.share.enableLabel")}
            </Label>
            <Switch
              checked={shareEnabled}
              disabled={isPending}
              id="template-share-enabled"
              onCheckedChange={toggleShareEnabled}
            />
          </div>

          {shareEnabled && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="template-share-url">
                {t("templates.share.linkLabel")}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  className="truncate"
                  id="template-share-url"
                  readOnly
                  value={shareUrl}
                />
                <Button
                  className="flex-none"
                  disabled={!shareUrl}
                  onClick={() => handleCopy(shareUrl)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="justify-end">
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {isPending && (
                  <Loader2Icon className="me-2 h-4 w-4 animate-spin" />
                )}
                {t("actions.cancel")}
              </Button>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
