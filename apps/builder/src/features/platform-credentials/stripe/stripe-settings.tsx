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
import { SiStripe, SiStripeHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"
import { CredentialFallbackNote } from "../credential-fallback-note"
import { DeleteCredentialDialog } from "../delete-credential-dialog"
import { useCredentialScope } from "../provider/credential-scope-context"
import { deleteStripeSettingsAction } from "./delete-stripe-settings.action"
import { updateStripeSettingsAction } from "./update-stripe-settings.action"

/** Where Stripe Connect sends store owners back; must be added in Stripe. */
const STRIPE_CONNECT_CALLBACK_PATH = "/integrations/stripe/callback"

/** Whether stores can connect yet, and whether their payments are confirmed. */
const connectStatusKey = (hasClientId: boolean, hasWebhook: boolean) => {
  if (!hasClientId) {
    return "stripe.platform.connectMissing"
  }
  return hasWebhook
    ? "stripe.platform.webhookReady"
    : "stripe.platform.webhookMissing"
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { handleCopy } = useClipboard()
  return (
    <div className="flex flex-col gap-1">
      <div className="font-bold">{label}:</div>
      <div className="flex items-center gap-2">
        <span className="truncate">{value}</span>
        <Button
          className="flex-none"
          onClick={() => handleCopy(value)}
          size="icon"
          type="button"
          variant="outline"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * The Stripe settings stores connect their own account through (Stripe
 * Connect OAuth). The Redirect URI is what Stripe must list under Connect →
 * Onboarding options → OAuth; the Connect webhook is created on save.
 */
export function StripeSettings({
  publicConfig,
  isInherited = false,
  callbackOrigin,
  hasConnectWebhook,
}: {
  publicConfig: StripeCredentialPublic | null
  isInherited?: boolean
  callbackOrigin: string
  hasConnectWebhook: boolean
}) {
  const t = useTranslations()
  const redirectUri = new URL(
    STRIPE_CONNECT_CALLBACK_PATH,
    callbackOrigin,
  ).toString()

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiStripe className="size-6" fill={SiStripeHex} />
          <span>Stripe</span>
        </CardTitle>
        <CardAction>
          <EditStripeSettingsDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {publicConfig?.publishableKey ? (
            <>
              <CopyRow
                label={t("fields.publishableKey.label")}
                value={publicConfig.publishableKey}
              />
              {publicConfig.connectClientId ? (
                <CopyRow
                  label={t("stripe.platform.connectClientId")}
                  value={publicConfig.connectClientId}
                />
              ) : null}
              <p className="text-muted-foreground text-sm">
                {t(
                  connectStatusKey(
                    Boolean(publicConfig.connectClientId),
                    hasConnectWebhook,
                  ),
                )}
              </p>
            </>
          ) : (
            <CredentialFallbackNote isInherited={isInherited} />
          )}
          <CopyRow
            label={t("stripe.platform.redirectUri")}
            value={redirectUri}
          />
        </div>
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
  const scope = useCredentialScope()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateStripeSettingsAction.bind(null, scope),
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
            connectClientId: publicConfig?.connectClientId ?? "",
          } satisfies StripeCredentialUpdate,
        },
      },
    )

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteStripeSettingsAction.bind(null, scope),
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

        <InputField
          description={t("stripe.platform.connectClientIdHint")}
          label={t("stripe.platform.connectClientId")}
          name="connectClientId"
          placeholder="ca_…"
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
