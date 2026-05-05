"use client"

import {
  type OrganizationSettings,
  type StripeSettingsSchema,
  stripeSettingsSchema,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { updateStripeSettingsAction } from "./update-stripe-settings.action"

export function StripeSettings({
  config,
}: {
  config: OrganizationSettings["stripe"]
}) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()
  const [webhookUrl, setWebhookUrl] = useState<string>("")
  useEffect(() => {
    setWebhookUrl(
      new URL(
        "/integrations/stripe/webhook",
        window.location.origin,
      ).toString(),
    )
  }, [])

  const handleCopy = (text: string) => () => {
    copy(text)
      .then(() => {
        toast.success("Copied to clipboard")
      })
      .catch((error) => {
        console.error("Failed to copy!", error)
      })
  }

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <span className="font-semibold text-lg">Stripe</span>
        </CardTitle>
        <CardAction>
          <EditStripeSettingsDialog config={config ?? null} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {config?.publishableKey ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <div className="font-bold">
                {t("fields.publishableKey.label")}:
              </div>
              <div className="flex items-center gap-2">
                <span className="truncate">••••••••</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">{t("fields.secretKey.label")}:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">••••••••</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">Webhook URL:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">{webhookUrl}</span>
                <Button className="flex-none" size="icon" variant="outline">
                  <CopyIcon
                    className="size-4"
                    onClick={handleCopy(webhookUrl)}
                  />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("messages.needToAddSettings")}
          </p>
        )}
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
