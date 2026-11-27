"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
import { useState } from "react"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { connectStripeKeyAction } from "../actions/connect-stripe-key.action"
import { connectStripeKeyRequest } from "../schema/public"

const STRIPE_API_KEYS_URL = "https://dashboard.stripe.com/apikeys"

/**
 * Connects the store's own Stripe account with its secret key, for stores
 * that do not (or cannot) go through Stripe Connect.
 */
export function ConnectStripeKeyDialog(props: {
  workspaceId: string
  /** The secondary choice next to Stripe Connect, or the only one. */
  variant: "secondary" | "ghost"
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      connectStripeKeyAction.bind(null, props.workspaceId),
      zodResolver(connectStripeKeyRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            setOpen(false)
            resetFormAndAction()
            router.refresh()
            toast.success(t("messages.connectSuccess", { feature: "Stripe" }))
            // Test mode takes test payments before the account is activated.
            if (data?.livemode && data.chargesEnabled === false) {
              toast.warning(t("stripe.chargesDisabled"))
            }
          },
          onError: toastActionError(
            t("messages.connectFailed", { feature: "Stripe" }),
          ),
        },
        formProps: {
          mode: "onChange",
          defaultValues: { secretKey: "" },
        },
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" variant={props.variant}>
            {t("stripe.connectWithKey")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("actions.connectFeature", { feature: "Stripe" })}
          </DialogTitle>
          <DialogDescription>
            {t.rich("stripe.dialog.description", {
              link: (chunks) => (
                <a
                  className="underline"
                  href={STRIPE_API_KEYS_URL}
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
              description={t("stripe.fields.secretKeyHint")}
              label={t("stripe.fields.secretKey")}
              name="secretKey"
              placeholder="sk_live_…"
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
  )
}
