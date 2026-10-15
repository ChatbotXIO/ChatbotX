"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MiniAppRunner } from "../runner/mini-app-runner"
import { useMiniAppEditor } from "./editor-context"

/** Runs the unsaved Mini App as a visitor would; a submit only shows the answers. */
export function PreviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("miniApps.editor")
  const definition = useMiniAppEditor((state) => state.definition)
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("preview")}</DialogTitle>
        </DialogHeader>
        <div className="h-[600px] overflow-y-auto rounded-xl border">
          {open ? (
            <MiniAppRunner
              definition={definition}
              onComplete={(answers) => {
                toast.info(
                  t("previewSubmitted", { answers: JSON.stringify(answers) }),
                )
                return Promise.resolve()
              }}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
