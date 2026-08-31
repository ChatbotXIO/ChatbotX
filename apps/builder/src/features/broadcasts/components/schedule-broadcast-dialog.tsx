"use client"

import type { BroadcastModel } from "@chatbotx.io/database/types"
import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
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
import { scheduleBroadcastAction } from "../actions/schedule-broadcast.action"
import {
  type ScheduleBroadcastSchema,
  scheduleBroadcastSchema,
} from "../schema/action"

// Single source of truth for the form's reset target — reused by
// `formProps.defaultValues` (initial mount) and the resync effect below
// (every time the dialog reopens), so both always agree.
const SCHEDULE_FORM_DEFAULTS = {
  schedulesType: "now",
  schedulesAt: null,
} as const satisfies ScheduleBroadcastSchema

export function ScheduleBroadcastDialog({
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

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      scheduleBroadcastAction.bind(
        null,
        broadcast?.workspaceId ?? "",
        broadcast?.id ?? "",
      ),
      zodResolver(scheduleBroadcastSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.broadcast.label"),
              }),
            )
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
          defaultValues: SCHEDULE_FORM_DEFAULTS,
        },
        errorMapProps: {},
      },
    )

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
      resetFormAndAction()
    }
  }, [open, broadcast?.id, resetFormAndAction])

  const schedulesType = useWatch({
    control: form.control,
    name: "schedulesType",
  })
  const options = useMemo(
    () => [
      { value: "now", label: t("fields.schedule.now") },
      { value: "future", label: t("fields.schedule.scheduled") },
    ],
    [t],
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-6"
            onSubmit={handleSubmitWithAction}
          >
            <DialogHeader>
              <DialogTitle>{t("broadcasts.scheduleDialog.title")}</DialogTitle>
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
            />
            {schedulesType === "future" && (
              <DateTimePickerField
                disabled={{ before: new Date() }}
                displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
                granularity="minute"
                label={t("fields.chooseTime.label")}
                name="schedulesAt"
                required
              />
            )}
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
  )
}
