"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { updateSmartResponseDelayAction } from "@/features/workspaces/actions/update-workspace-action"
import { getSmartResponseDelaySelectOptions } from "@/features/workspaces/helpers"
import {
  SMART_RESPONSE_DELAY_NONE_VALUE,
  updateSmartResponseDelayRequest,
} from "@/features/workspaces/schema/update-workspace-schema"

// The delay is stored on the workspace and shared by every agent; this dialog
// only surfaces it per agent row for discoverability.
export function BotReplyDelayDialog({
  workspaceId,
  smartResponseDelaySeconds,
  open,
  onOpenChange,
  onSuccess,
}: {
  workspaceId: string
  smartResponseDelaySeconds: number | null
  open: boolean
  onOpenChange: (val: boolean) => void
  onSuccess?: () => void
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateSmartResponseDelayAction.bind(null, workspaceId),
    zodResolver(updateSmartResponseDelayRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.smartResponseDelaySeconds.label"),
            }),
          )

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
        mode: "onChange",
        // `values` (not defaultValues): the dialog stays mounted between opens,
        // so the field must re-sync after a save refreshes the workspace.
        values: {
          smartResponseDelaySeconds:
            smartResponseDelaySeconds == null
              ? SMART_RESPONSE_DELAY_NONE_VALUE
              : String(smartResponseDelaySeconds),
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("fields.smartResponseDelaySeconds.label")}
          </DialogTitle>
          <DialogDescription>
            {t("fields.smartResponseDelaySeconds.description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmitWithAction}>
            <SelectField
              name="smartResponseDelaySeconds"
              options={getSmartResponseDelaySelectOptions(t)}
              placeholder={t("actions.pleaseSelect")}
            />

            <DialogFooter className="mt-4 justify-end gap-2 sm:gap-2">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon aria-hidden className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
