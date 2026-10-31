"use client"

import { PIPELINE_LIMITS } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { LockedDialogFieldset } from "@/components/locked-dialog-fieldset"
import { useIsLocked } from "@/features/templates/components/lock-badge"

type PipelineNameDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  submitLabel: string
  initialName?: string
  isPending: boolean
  /** The pipeline being renamed; omit when creating. */
  resourceId?: string
  /** Receives the trimmed, non-empty name. */
  onSubmit: (name: string) => void
}

/** Dialog asking for a pipeline's new name. */
export function PipelineNameDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialName = "",
  isPending,
  resourceId,
  onSubmit,
}: PipelineNameDialogProps) {
  const t = useTranslations("pipelines")
  const isLocked = useIsLocked(resourceId)
  const [name, setName] = useState(initialName)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <LockedDialogFieldset resourceId={resourceId}>
          <div className="flex flex-col gap-3">
            <label className="grid gap-1.5 text-sm" htmlFor="pipeline-name">
              {t("create.name")}
              <Input
                id="pipeline-name"
                maxLength={PIPELINE_LIMITS.name}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
          </div>
        </LockedDialogFieldset>
        <DialogFooter>
          <Button
            disabled={isPending || isLocked || name.trim().length === 0}
            onClick={() => onSubmit(name.trim())}
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
