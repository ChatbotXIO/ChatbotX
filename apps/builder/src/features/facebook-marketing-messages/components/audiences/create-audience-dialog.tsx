"use client"

import type { AudienceUploadResult } from "@chatbotx.io/business/facebook-marketing-message-audience"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useInvalidateMarketingMessagesAudiences } from "../../hooks/use-audiences"
import { StepConfirm } from "./step-confirm"
import { StepPrepare } from "./step-prepare"
import { StepUpload, type UploadTarget } from "./step-upload"

const STEPS = ["prepare", "upload", "confirm"] as const
type Step = (typeof STEPS)[number]

export function CreateAudienceDialog({
  workspaceId,
  open,
  onOpenChange,
  target,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` = create a new audience; otherwise append rows to it. */
  target: UploadTarget | null
}) {
  const t = useTranslations("facebookMarketingMessages.audiences.wizard")
  const invalidate = useInvalidateMarketingMessagesAudiences()
  const [step, setStep] = useState<Step>("prepare")
  const [result, setResult] = useState<AudienceUploadResult | null>(null)
  const [pending, setPending] = useState(false)
  // Held here, not in the step, so Back cannot clear it: a partial create may
  // have left an audience on Meta, and a retry would create a second one.
  const [partialMessage, setPartialMessage] = useState<string | null>(null)

  const close = (next: boolean) => {
    if (next) {
      onOpenChange(true)
      return
    }
    // Never dismiss mid-upload: overlay click, Escape and the X all land here.
    if (pending) {
      return
    }
    setStep("prepare")
    setResult(null)
    setPartialMessage(null)
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>
            {target ? t("uploadMoreTitle") : t("title")}
          </DialogTitle>
        </DialogHeader>
        <ol className="flex items-center gap-2 text-sm">
          {STEPS.map((key, index) => (
            <li
              className={cn(
                "flex items-center gap-2",
                key === step ? "font-semibold" : "text-muted-foreground",
              )}
              key={key}
            >
              <span className="flex size-6 items-center justify-center rounded-full border">
                {index + 1}
              </span>
              {t(`steps.${key}`)}
            </li>
          ))}
        </ol>
        {step === "prepare" && <StepPrepare onNext={() => setStep("upload")} />}
        {step === "upload" && (
          <StepUpload
            lockedMessage={partialMessage}
            onBack={() => setStep("prepare")}
            onFailed={({ message, lockUpload }) => {
              // An audience row may exist now, so refresh both lists (inv. 21).
              invalidate()
              if (lockUpload) {
                setPartialMessage(message)
              }
            }}
            onPendingChange={setPending}
            onUploaded={async (uploaded) => {
              setResult(uploaded)
              setStep("confirm")
              await invalidate()
            }}
            target={target}
            uploadLocked={partialMessage !== null}
            workspaceId={workspaceId}
          />
        )}
        {step === "confirm" && result && (
          <StepConfirm onDone={() => close(false)} result={result} />
        )}
      </DialogContent>
    </Dialog>
  )
}
