"use client"

import {
  type StripeCredentialPublic,
  type StripeCredentialUpdate,
  stripeCredentialUpdateSchema,
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
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { DeleteCredentialDialog } from "../delete-credential-dialog"
import { deleteStripeSettingsAction } from "./delete-stripe-settings.action"
import { updateStripeSettingsAction } from "./update-stripe-settings.action"

export function StripeSettings({
  publicConfig,
}: {
  publicConfig: StripeCredentialPublic | null
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  // Webhook URL must live on the fixed, canonical broker host — never the
  // reseller's white-label custom domain. Stripe signature verification is
  // host-independent, so the broker host receives and validates events.
  const webhookUrl = buildBrokerCallbackUrl("/integrations/stripe/webhook")

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <span className="font-semibold text-lg">Stripe</span>
        </CardTitle>
        <CardAction>
          <EditStripeSettingsDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {publicConfig?.publishableKey ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <div className="font-bold">
                {t("fields.publishableKey.label")}:
              </div>
              <div className="flex items-center gap-2">
                <span className="truncate">{publicConfig.publishableKey}</span>
                <Button
                  className="flex-none"
                  onClick={() => handleCopy(publicConfig.publishableKey)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">{t("fields.verifyToken.label")}:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">{publicConfig.verifyToken}</span>
                <Button
                  className="flex-none"
                  onClick={() => handleCopy(publicConfig.verifyToken)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">Webhook URL:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">{webhookUrl}</span>
                <Button
                  className="flex-none"
                  onClick={() => handleCopy(webhookUrl)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
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
  publicConfig,
}: {
  publicConfig: StripeCredentialPublic | null
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button">
            {t("actions.edit")}
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle>
          {t("messages.editFeature", { feature: "Stripe" })}
        </DialogTitle>

        <EditStripeSettingsForm
          onClose={() => {
            setOpen(false)
            router.refresh()
          }}
          publicConfig={publicConfig}
        />
      </DialogContent>
    </Dialog>
  )
}

export function EditStripeSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: StripeCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateStripeSettingsAction,
      zodResolver(stripeCredentialUpdateSchema),
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
            publishableKey: publicConfig?.publishableKey ?? "",
            verifyToken: publicConfig?.verifyToken ?? "",
            secretKey: "",
          } satisfies StripeCredentialUpdate,
        },
      },
    )

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteStripeSettingsAction,
    {
      onSuccess: () => {
        toast.success(t("messages.deletedSuccess", { feature: "Stripe" }))
        onClose?.()
      },
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
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

        <div className="flex items-center justify-between gap-2">
          {publicConfig !== null && (
            <DeleteCredentialDialog
              disabled={form.formState.isSubmitting}
              feature="Stripe"
              isDeleting={isDeleting}
              onConfirm={() => executeDelete()}
            />
          )}
          <div className="ms-auto flex gap-2">
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
              disabled={
                !form.formState.isValid ||
                form.formState.isSubmitting ||
                isDeleting
              }
              type="submit"
            >
              {form.formState.isSubmitting && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {t("actions.save")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
