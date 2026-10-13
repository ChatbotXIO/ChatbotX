"use client"

import {
  BROADCAST_DEFAULT_SEND_RATE_PER_MINUTE,
  BROADCAST_MAX_SEND_RATE_PER_MINUTE,
} from "@chatbotx.io/database/partials"
import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
import { useEffect, useMemo } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { RecurrenceRuleFields } from "@/components/recurrence/recurrence-rule-fields"
import { useRecurrenceRuleSwitch } from "@/components/recurrence/use-recurrence-rule-switch"
import { scheduleBroadcastAction } from "../actions/schedule-broadcast.action"
import { useBroadcastPlanLimit } from "../hooks/use-broadcast-plan-limit"
import { useInvalidateBroadcastRuns } from "../hooks/use-invalidate-broadcast-runs"
import { isBroadcastPlanLimitOutcome } from "../lib/broadcast-plan-limit"
import { buildBroadcastScheduleTypeOptions } from "../lib/schedule-type-options"
import {
  type ScheduleBroadcastSchema,
  scheduleBroadcastSchema,
} from "../schema/action"
import type { BroadcastResourceWithRelations } from "../schema/resource"
import { BroadcastPlanLimitDialog } from "./broadcast-plan-limit-dialog"

// Single source of truth for the form's reset target — reused by
// `formProps.defaultValues` (initial mount) and the resync effect below
// (every time the dialog reopens), so both always agree.
const resolveScheduleFormDefaults = (
  broadcast: BroadcastResourceWithRelations | null,
): ScheduleBroadcastSchema => {
  const savedRule = broadcast?.recurrence?.rule
  return {
    // A draft that already repeats reopens on its saved rule.
    schedulesType: savedRule ? "recurring" : "now",
    schedulesAt: null,
    recurrence: savedRule,
    sendRatePerMinute: broadcast?.sendRatePerMinute ?? null,
  }
}

const scheduleBroadcastDialogSchema = scheduleBroadcastSchema.transform(
  (data) => ({
    ...data,
    sendRatePerMinute: data.sendRatePerMinute ?? null,
  }),
)

export function ScheduleBroadcastDialog({
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
  const invalidateRuns = useInvalidateBroadcastRuns()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      scheduleBroadcastAction.bind(
        null,
        broadcast?.workspaceId ?? "",
        broadcast?.id ?? "",
      ),
      zodResolver(scheduleBroadcastDialogSchema),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            if (isBroadcastPlanLimitOutcome(data)) {
              onOpenChange(false)
              planLimit.show(data)
              return
            }
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.broadcast.label"),
              }),
            )
            invalidateRuns()
            resetFormAndAction()
            onOpenChange(false)
            onSuccess?.()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        formProps: {
          defaultValues: resolveScheduleFormDefaults(broadcast),
        },
        errorMapProps: {},
      },
    )

  const { selectScheduleType, forget: forgetRule } = useRecurrenceRuleSwitch({
    read: () => form.getValues("recurrence"),
    write: (rule) =>
      form.setValue("recurrence", rule, { shouldValidate: true }),
    savedRule: broadcast?.recurrence?.rule,
  })

  // Reset to defaults every time the dialog opens for a broadcast — the
  // component stays mounted in the table and only toggles `open`, so
  // without this a cancelled "future" + date selection leaks into the
  // next broadcast's Schedule dialog.
  // `broadcast?.id` isn't read in the body, but it's kept as a dependency
  // on purpose: the modal overlay currently guarantees `open` always cycles
  // through `false` between two different broadcasts, but if that ever
  // stops holding, this still forces a reset instead of silently reusing
  // stale values for the new broadcast.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional extra dependency, see comment above
  useEffect(() => {
    if (open) {
      forgetRule()
      resetFormAndAction()
      form.reset(resolveScheduleFormDefaults(broadcast))
    }
  }, [open, broadcast?.id, form, resetFormAndAction])

  const schedulesType = useWatch({
    control: form.control,
    name: "schedulesType",
  })
  const options = useMemo(() => buildBroadcastScheduleTypeOptions(t), [t])

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <Form {...form}>
            <form
              className="flex flex-col gap-6"
              onSubmit={handleSubmitWithAction}
            >
              <DialogHeader>
                <DialogTitle>
                  {t("broadcasts.scheduleDialog.title")}
                </DialogTitle>
                <DialogDescription>
                  {t("broadcasts.scheduleDialog.description", {
                    name: broadcast?.name ?? "",
                  })}
                </DialogDescription>
              </DialogHeader>
              <SelectField
                label={t("fields.schedule.label")}
                name="schedulesType"
                options={options}
                required
                triggerValueChange={(value) =>
                  selectScheduleType(value === "recurring")
                }
              />
              {schedulesType === "future" && (
                <DateTimePickerField
                  disabled={{ before: new Date() }}
                  displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
                  granularity="minute"
                  label={t("fields.chooseTime.label")}
                  name="schedulesAt"
                  required
                  // See `create-broadcast-form.tsx`: the persisted value must be
                  // an ISO instant so the operator's wall-clock choice keeps its
                  // offset across the wire.
                  saveFormat="iso"
                />
              )}
              {schedulesType === "recurring" && (
                <RecurrenceRuleFields
                  occurrenceCount={broadcast?.recurrence?.occurrenceCount}
                />
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
                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.schedule")}
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
