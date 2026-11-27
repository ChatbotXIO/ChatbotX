"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"

export type AhachatImportDialogProps = {
  /** The page whose history sync was just turned on. */
  rowName: string
  /** Import its contacts from AhaChat first, then sync its history. */
  onImportFirst: () => void
  /** Sync the history only. Closing the dialog means the same. */
  onHistoryOnly: () => void
}

/**
 * Asked when "Sync history" is turned on for a page, where the server can talk
 * to AhaChat and the member may use it. AhaChat is not asked about the page
 * yet (it is not connected): if AhaChat does not have it, the history sync
 * simply starts at once after the connect. Not a `<form>`: it renders inside
 * the picker's own form, and a nested submit would send it.
 */
export function AhachatImportDialog({
  rowName,
  onImportFirst,
  onHistoryOnly,
}: AhachatImportDialogProps) {
  const t = useTranslations()

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onHistoryOnly()
        }
      }}
      open
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("ahachatImport.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("ahachatImport.dialogDescription", { page: rowName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onHistoryOnly} type="button" variant="ghost">
            {t("ahachatImport.historyOnly")}
          </Button>
          <Button onClick={onImportFirst} type="button">
            {t("ahachatImport.importFirst")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
