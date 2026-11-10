"use client"

import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { useCloseWhenSettled } from "@/features/conversations/hooks/use-close-when-settled"
import {
  type ThreadControlNoteFormValues,
  threadControlNoteFormSchema,
} from "@/features/conversations/schema/thread-control"
import { useValidationErrorMap } from "@/lib/validation/use-validation-error-map"

type TakeFormProps = {
  isExecuting: boolean
  onCancel: () => void
  onSubmit: (values: ThreadControlNoteFormValues) => void
}

/** Mounted only while the dialog is open, so its state resets on every open. */
function ThreadControlTakeForm({
  isExecuting,
  onCancel,
  onSubmit,
}: TakeFormProps) {
  const t = useTranslations()
  const errorMap = useValidationErrorMap()
  const form = useForm<ThreadControlNoteFormValues>({
    resolver: zodResolver(threadControlNoteFormSchema, { error: errorMap }),
    defaultValues: { metadata: "" },
  })

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <TextareaField
          className="max-h-40"
          label={t("conversationRouting.composer.takeOverNoteLabel")}
          name="metadata"
          rows={3}
        />
        <DialogFooter>
          <Button
            disabled={isExecuting}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            {t("actions.cancel")}
          </Button>
          <Button disabled={isExecuting} type="submit">
            {isExecuting && (
              <Loader2Icon aria-hidden className="animate-spin" />
            )}
            {t("conversationRouting.composer.takeOver")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

type ThreadControlTakeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** True while the take is in flight; the dialog closes when it settles. */
  isExecuting: boolean
  /** Runs the take with the optional note for the partner losing the thread. */
  onConfirm: (metadata: string | undefined) => void
}

/**
 * Confirms a take-over and lets the agent leave a note for the partner that
 * loses the thread (delivered with Meta's handover event). The take itself and
 * its refusal stay with the composer, which owns the action hook.
 */
export function ThreadControlTakeDialog({
  open,
  onOpenChange,
  isExecuting,
  onConfirm,
}: ThreadControlTakeDialogProps) {
  const t = useTranslations()

  useCloseWhenSettled(isExecuting, onOpenChange)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("conversationRouting.composer.takeOverTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("conversationRouting.composer.takeOverDescription")}
          </DialogDescription>
        </DialogHeader>
        <ThreadControlTakeForm
          isExecuting={isExecuting}
          onCancel={() => onOpenChange(false)}
          onSubmit={({ metadata }) => onConfirm(metadata || undefined)}
        />
      </DialogContent>
    </Dialog>
  )
}
