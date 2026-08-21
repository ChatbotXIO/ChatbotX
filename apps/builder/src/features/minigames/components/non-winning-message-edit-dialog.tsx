"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"

type NonWinningMessageEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NonWinningMessageEditDialog({
  open,
  onOpenChange,
}: NonWinningMessageEditDialogProps) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("minigames.nonWinningMessageDialog.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <InputField
            label={t("minigames.nonWinningMessageDialog.titleLabel")}
            name="nonWinningMessageSettings.title"
          />
          <TextareaField
            label={t("fields.description.label")}
            name="nonWinningMessageSettings.description"
          />
          <InputField
            label={t("minigames.nonWinningMessageDialog.shareButtonText")}
            name="nonWinningMessageSettings.shareButtonText"
          />
          <TextareaField
            label={t(
              "minigames.nonWinningMessageDialog.shareButtonDescription",
            )}
            name="nonWinningMessageSettings.shareButtonDescription"
          />
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <DialogClose
            render={<Button type="button">{t("actions.save")}</Button>}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
