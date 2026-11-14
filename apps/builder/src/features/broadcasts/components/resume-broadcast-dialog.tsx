"use client"

import {
  BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE,
  BROADCAST_MAX_SEND_RATE_PER_MINUTE,
  isRecurringTemplate,
} from "@chatbotx.io/database/partials"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
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
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { resumeBroadcastAction } from "../actions/resume-broadcast.action"
import { useBroadcastPlanLimit } from "../hooks/use-broadcast-plan-limit"
import {
  type ResumeBroadcastSchema,
  resumeBroadcastSchema,
} from "../schema/action"
import type { BroadcastResourceWithRelations } from "../schema/resource"
import { BroadcastPlanLimitDialog } from "./broadcast-plan-limit-dialog"
import { useBroadcastTransitionActionCallbacks } from "./broadcast-transition-dialog"

const resolveResumeFormDefaults = (
  broadcast: BroadcastResourceWithRelations | null,
): ResumeBroadcastSchema => ({
  sendRatePerMinute: broadcast?.sendRatePerMinute ?? null,
})

const resumeBroadcastDialogSchema = resumeBroadcastSchema.transform((data) => ({
  sendRatePerMinute: data.sendRatePerMinute ?? null,
}))

/** Shown when the system stopped the broadcast: resuming overrides a warning. */
function BlockedAccountWarning({
  broadcast,
}: {
  broadcast: BroadcastResourceWithRelations
}) {
  const t = useTranslations()

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
      role="alert"
    >
      <p className="font-medium text-destructive">
        {t("broadcasts.resumeDialog.blocked.title")}
      </p>
      {broadcast.statusReason && (
        <p>{t(`broadcasts.statusReason.${broadcast.statusReason}`)}</p>
      )}
      {broadcast.statusInbox && (
        <p>
          <span className="font-medium">
            {t("broadcasts.resumeDialog.blocked.pageLabel")}:
          </span>{" "}
          {broadcast.statusInbox.name}
        </p>
      )}
      {broadcast.statusErrorMessage && (
        <p className="break-words">
          <span className="font-medium">
            {t("broadcasts.resumeDialog.blocked.errorLabel")}:
          </span>{" "}
          {broadcast.statusErrorMessage}
        </p>
      )}
      <p className="text-muted-foreground">
        {t("broadcasts.resumeDialog.blocked.description")}
      </p>
    </div>
  )
}

export function ResumeBroadcastDialog({
  broadcast,
  open,
  onOpenChange,
  onSuccess,
}: {
  broadcast: BroadcastResourceWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const planLimit = useBroadcastPlanLimit()
  const callbacks = useBroadcastTransitionActionCallbacks({
    onOpenChange,
    onSuccess,
    onPlanLimit: planLimit.show,
  })
  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      resumeBroadcastAction.bind(
        null,
        broadcast?.workspaceId ?? "",
        broadcast?.id ?? "",
      ),
      zodResolver(resumeBroadcastDialogSchema),
      {
        actionProps: callbacks,
        formProps: {
          defaultValues: resolveResumeFormDefaults(broadcast),
        },
        errorMapProps: {},
      },
    )

  // This dialog stays mounted in the table, so every selected broadcast must
  // replace the previous form value before the dialog becomes interactive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: broadcast id intentionally forces a reset
  useEffect(() => {
    if (open) {
      resetFormAndAction()
      form.reset(resolveResumeFormDefaults(broadcast))
    }
  }, [open, broadcast?.id, form, resetFormAndAction])

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent>
          <Form {...form}>
            <form
              className="flex flex-col gap-6"
              onSubmit={handleSubmitWithAction}
            >
              <DialogHeader>
                <DialogTitle>{t("broadcasts.resumeDialog.title")}</DialogTitle>
                {/* A system-stopped broadcast shows the warning below instead of the reassuring copy. */}
                {!broadcast?.statusReason && (
                  <DialogDescription>
                    {t(
                      broadcast && isRecurringTemplate(broadcast)
                        ? "broadcasts.resumeDialog.templateDescription"
                        : "broadcasts.resumeDialog.description",
                      { name: broadcast?.name ?? "" },
                    )}
                  </DialogDescription>
                )}
              </DialogHeader>
              {broadcast?.statusReason && (
                <BlockedAccountWarning broadcast={broadcast} />
              )}
              <InputNumberField
                description={t("broadcasts.sendLimit.rateHint")}
                label={t("fields.sendRatePerMinute.label")}
                max={BROADCAST_MAX_SEND_RATE_PER_MINUTE}
                min={1}
                name="sendRatePerMinute"
                placeholder={String(
                  broadcast?.sendRatePerMinute ??
                    BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE,
                )}
              />
              <DialogFooter>
                <DialogClose
                  render={
                    <Button type="button" variant="outline">
                      {t("actions.cancel")}
                    </Button>
                  }
                />
                <Button disabled={form.formState.isSubmitting} type="submit">
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t(
                    broadcast?.statusReason
                      ? "broadcasts.resumeDialog.blocked.confirm"
                      : "actions.resume",
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <BroadcastPlanLimitDialog
        onDismiss={planLimit.dismiss}
        onOpenPricing={planLimit.openPricing}
        state={planLimit.state}
      />
    </>
  )
}
