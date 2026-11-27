"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { connectPaypalAction } from "../actions/connect-paypal.action"
import { disconnectPaymentProviderAction } from "../actions/disconnect-payment-provider.action"
import {
  connectPaypalRequest,
  type PaymentProviderResource,
} from "../schema/public"

const PAYPAL_APPS_URL = "https://developer.paypal.com/dashboard/applications"

/**
 * The PayPal row: a dialog for the REST app's Client ID and Secret (live or
 * sandbox is found from the keys), or the connected app with a disconnect.
 */
export function ManagePaypal(props: {
  workspaceId: string
  connection: PaymentProviderResource | null
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      connectPaypalAction.bind(null, props.workspaceId),
      zodResolver(connectPaypalRequest),
      {
        actionProps: {
          onSuccess: () => {
            setOpen(false)
            resetFormAndAction()
            router.refresh()
            toast.success(t("messages.connectSuccess", { feature: "PayPal" }))
          },
          onError: toastActionError(
            t("messages.connectFailed", { feature: "PayPal" }),
          ),
        },
        formProps: {
          mode: "onChange",
          defaultValues: { clientId: "", clientSecret: "" },
        },
      },
    )
  const { executeAsync: disconnect, isPending: isDisconnecting } = useAction(
    disconnectPaymentProviderAction.bind(null, props.workspaceId),
    {
      onSuccess: () => {
        setDisconnectOpen(false)
        router.refresh()
        toast.success(t("messages.disconnectSuccess", { feature: "PayPal" }))
      },
      onError: toastActionError(t("messages.unknownError")),
    },
  )

  const connection = props.connection
  return (
    <SettingRow
      description={t("paypal.setting.description")}
      label={t("paypal.setting.label")}
    >
      {connection ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-muted-foreground text-sm">
            {connection.accountLabel}
          </span>
          <Badge variant={connection.livemode ? "default" : "secondary"}>
            {connection.livemode ? t("paypal.liveMode") : t("paypal.sandbox")}
          </Badge>
          <DisconnectIntegrationDialog
            featureLabel="PayPal"
            isPending={isDisconnecting}
            onConfirm={() => disconnect({ provider: "paypal" })}
            onOpenChange={setDisconnectOpen}
            open={disconnectOpen}
          />
        </div>
      ) : (
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogTrigger
            render={
              <Button size="sm" variant="secondary">
                {t("actions.connect")}
              </Button>
            }
          />
          <DialogContent className="max-h-screen overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t("actions.connectFeature", { feature: "PayPal" })}
              </DialogTitle>
              <DialogDescription>
                {t.rich("paypal.dialog.description", {
                  link: (chunks) => (
                    <a
                      className="underline"
                      href={PAYPAL_APPS_URL}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="space-y-4" onSubmit={handleSubmitWithAction}>
                <InputField
                  autoComplete="off"
                  label={t("paypal.fields.clientId")}
                  name="clientId"
                  required
                />
                <InputField
                  autoComplete="off"
                  label={t("paypal.fields.clientSecret")}
                  name="clientSecret"
                  required
                  type="password"
                />
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button type="button" variant="secondary">
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
                    {form.formState.isSubmitting ? (
                      <Loader2Icon className="animate-spin" />
                    ) : null}
                    {t("actions.connect")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </SettingRow>
  )
}
