"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { createInboundWebhookAction } from "../actions/create-inbound-webhook.action"
import { translateInboundWebhookError } from "../lib/server-error"
import { createInboundWebhookRequest } from "../schema/action"

export const CreateInboundWebhookDialog = ({
  workspaceId,
}: {
  workspaceId: string
}) => {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createInboundWebhookAction.bind(null, workspaceId),
      zodResolver(createInboundWebhookRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("inboundWebhooks.feature"),
              }),
            )
            resetFormAndAction()
            setOpen(false)
            // A new webhook starts inactive; the editor is where it is set up.
            router.push(`/space/${workspaceId}/inbound-webhooks/${data.id}`)
          },
          onError: ({ error }) => {
            toast.error(
              translateInboundWebhookError(
                t,
                error.serverError,
                t("inboundWebhooks.feature"),
              ),
            )
          },
        },
        formProps: { mode: "onChange", defaultValues: { name: "" } },
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button">
            <PlusIcon aria-hidden className="size-4" />
            {t("actions.createFeature", {
              feature: t("inboundWebhooks.feature"),
            })}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("inboundWebhooks.feature"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("inboundWebhooks.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setOpen(false)}
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
                {t("actions.create")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
