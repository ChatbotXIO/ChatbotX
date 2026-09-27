"use client"

import {
  BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE,
  BROADCAST_MAX_SEND_RATE_PER_MINUTE,
} from "@chatbotx.io/database/partials"
import type { BroadcastModel } from "@chatbotx.io/database/types"
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
import { BroadcastPlanLimitDialog } from "./broadcast-plan-limit-dialog"
import { useBroadcastTransitionActionCallbacks } from "./broadcast-transition-dialog"

const resolveResumeFormDefaults = (
  broadcast: BroadcastModel | null,
): ResumeBroadcastSchema => ({
  sendRatePerMinute: broadcast?.sendRatePerMinute ?? null,
})

const resumeBroadcastDialogSchema = resumeBroadcastSchema.transform((data) => ({
  sendRatePerMinute: data.sendRatePerMinute ?? null,
}))

export function ResumeBroadcastDialog({
  broadcast,
  open,
  onOpenChange,
  onSuccess,
}: {
  broadcast: BroadcastModel | null
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
                <DialogDescription>
                  {t("broadcasts.resumeDialog.description", {
                    name: broadcast?.name ?? "",
                  })}
                </DialogDescription>
              </DialogHeader>
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
                  {t("actions.resume")}
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
