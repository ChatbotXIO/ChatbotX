"use client"

import {
  type OrganizationSettings,
  type StripeSettingsSchema,
  stripeSettingsSchema,
} from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { updateStripeSettingsAction } from "./update-stripe-settings.action"

export function StripeSettings({
  config,
}: {
  config: OrganizationSettings["stripe"]
}) {
  const t = useTranslations()

  return (
    <Card className="w-96">
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <span className="font-semibold text-lg">Stripe</span>
        </CardTitle>
        <CardAction>
          <EditStripeSettingsDialog config={config ?? null} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <span className="font-bold">
              {t("fields.publishableKey.label")}:
            </span>
            <span>{config?.publishableKey ? "********" : "N/A"}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-bold">{t("fields.secretKey.label")}:</span>
            <span>{config?.secretKey ? "********" : "N/A"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function EditStripeSettingsDialog({
  config,
}: {
  config: StripeSettingsSchema | null
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>
          {t("messages.editFeature", { feature: "Stripe" })}
        </DialogTitle>

        <EditStripeSettingsForm
          config={config}
          onClose={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

export function EditStripeSettingsForm({
  config,
  onClose,
}: {
  config: StripeSettingsSchema | null
  onClose?: () => void
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateStripeSettingsAction,
      zodResolver(stripeSettingsSchema),
      {
        actionProps: {
          onSuccess: () => {
            onClose?.()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            publishableKey: config?.publishableKey ?? "",
            secretKey: config?.secretKey ?? "",
            verifyToken: config?.verifyToken ?? "",
          },
        },
      },
    )

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.publishableKey.label")}
          name="publishableKey"
          required
        />

        <InputField
          label={t("fields.secretKey.label")}
          name="secretKey"
          required
          type="password"
        />

        <InputField
          label={t("fields.verifyToken.label")}
          name="verifyToken"
          required
        />

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => {
              resetFormAndAction()
              onClose?.()
            }}
            type="button"
            variant="outline"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
