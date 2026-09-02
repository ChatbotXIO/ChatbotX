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
import { OutcomeMessageFields } from "./outcome-message-fields"

type WinningMessageEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WinningMessageEditDialog({
  open,
  onOpenChange,
}: WinningMessageEditDialogProps) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("minigames.winningMessageDialog.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <InputField
            label={t("minigames.winningMessageDialog.titleLabel")}
            name="winningMessageSettings.title"
          />
          <TextareaField
            description={t("minigames.winningMessageDialog.prizeNameHint")}
            label={t("fields.description.label")}
            name="winningMessageSettings.description"
          />
          <InputField
            label={t("minigames.winningMessageDialog.acceptButtonText")}
            name="winningMessageSettings.acceptButtonText"
          />
        </div>

        <OutcomeMessageFields
          enabledLabel={t("minigames.outcomeMessage.enableWin")}
          fieldPrefix="winningMessageSettings.outcomeMessage"
        />

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
