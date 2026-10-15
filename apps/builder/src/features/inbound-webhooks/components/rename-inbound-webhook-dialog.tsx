"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { updateInboundWebhookSettingsAction } from "../actions/update-inbound-webhook-settings.action"
import { updateInboundWebhookSettingsRequest } from "../schema/action"

type RenameInboundWebhookDialogProps = {
  workspaceId: string
  webhook: { id: string; name: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const RenameInboundWebhookDialog = ({
  workspaceId,
  webhook,
  open,
  onOpenChange,
}: RenameInboundWebhookDialogProps) => {
  const t = useTranslations()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue },
  } = useHookFormAction(
    updateInboundWebhookSettingsAction.bind(
      null,
      workspaceId,
      webhook?.id ?? "",
    ),
    zodResolver(updateInboundWebhookSettingsRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("inboundWebhooks.feature"),
            }),
          )
          resetFormAndAction()
          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: { mode: "onChange" },
    },
  )

  useEffect(() => {
    if (webhook) {
      setValue("name", webhook.name, { shouldValidate: true })
    }
  }, [webhook, setValue])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", {
              feature: t("inboundWebhooks.feature"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />
            <div className="flex justify-end gap-2">
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
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
