"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon, TriangleAlertIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { disconnectPaymentProviderAction } from "../actions/disconnect-payment-provider.action"
import { startStripeConnectAction } from "../actions/start-stripe-connect.action"
import type { PaymentProviderResource } from "../schema/public"

/** Why Stripe sent the member back without a connection, as the row says it. */
const OUTCOME_ERROR_KEYS = new Set([
  "access_denied",
  "stripeAccountAlreadyConnected",
  "stripePlatformNotConfigured",
  "superAdminRequired",
  "signInRequired",
  "paymentProviderCredentialsRejected",
  "paymentProviderInUse",
  "startedByAnotherUser",
])

/**
 * The Stripe row: connect through Stripe Connect (Stripe's own page), or the
 * connected account with a disconnect. Back from Stripe, the outcome the
 * callback put in the URL is shown once and removed.
 */
export function ManageStripe(props: {
  workspaceId: string
  connection: PaymentProviderResource | null
  available: boolean
}) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  const { execute: connect, isPending: isConnecting } = useAction(
    startStripeConnectAction.bind(null, props.workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data?.url) {
          setRedirecting(true)
          window.location.assign(data.url)
        }
      },
      onError: toastActionError(
        t("messages.connectFailed", { feature: "Stripe" }),
      ),
    },
  )
  const { executeAsync: disconnect, isPending: isDisconnecting } = useAction(
    disconnectPaymentProviderAction.bind(null, props.workspaceId),
    {
      onSuccess: () => {
        setDisconnectOpen(false)
        router.refresh()
        toast.success(t("messages.disconnectSuccess", { feature: "Stripe" }))
      },
      onError: toastActionError(t("messages.unknownError")),
    },
  )

  const outcome = searchParams.get("stripe")
  const reason = searchParams.get("reason")
  const chargesEnabled = searchParams.get("chargesEnabled")
  const shown = useRef(false)
  useEffect(() => {
    if (!outcome || shown.current) {
      return
    }
    shown.current = true
    if (outcome === "connected") {
      toast.success(t("messages.connectSuccess", { feature: "Stripe" }))
      if (chargesEnabled === "false") {
        toast.warning(t("stripe.chargesDisabled"))
      }
    } else if (outcome === "expired") {
      toast.error(t("stripe.outcome.expired"))
    } else {
      toast.error(
        reason && OUTCOME_ERROR_KEYS.has(reason)
          ? t(`stripe.outcome.${reason}` as "stripe.outcome.access_denied")
          : t("messages.connectFailed", { feature: "Stripe" }),
      )
    }
    router.replace(pathname, { scroll: false })
  }, [chargesEnabled, outcome, pathname, reason, router, t])

  const connection = props.connection
  return (
    <SettingRow
      description={t("stripe.setting.description")}
      label={t("stripe.setting.label")}
    >
      {connection ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="min-w-0 text-end text-sm">
            <p className="truncate font-medium">
              {connection.accountLabel ?? connection.accountId}
            </p>
            {connection.accountLabel ? (
              <p className="truncate text-muted-foreground text-xs">
                {connection.accountId}
              </p>
            ) : null}
          </div>
          <Badge variant={connection.livemode ? "default" : "secondary"}>
            {connection.livemode ? t("stripe.liveMode") : t("stripe.testMode")}
          </Badge>
          <DisconnectIntegrationDialog
            featureLabel="Stripe"
            isPending={isDisconnecting}
            onConfirm={() => disconnect({ provider: "stripe" })}
            onOpenChange={setDisconnectOpen}
            open={disconnectOpen}
          />
        </div>
      ) : (
        <ConnectStripe
          available={props.available}
          isPending={isConnecting || redirecting}
          onConnect={() => connect()}
        />
      )}
    </SettingRow>
  )
}

/** The connect button, or why there is none on this platform yet. */
function ConnectStripe(props: {
  available: boolean
  isPending: boolean
  onConnect: () => void
}) {
  const t = useTranslations()
  if (!props.available) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <TriangleAlertIcon className="size-4 shrink-0" />
        {t("stripe.setting.notConfigured")}
      </p>
    )
  }
  return (
    <Button
      disabled={props.isPending}
      onClick={props.onConnect}
      size="sm"
      variant="secondary"
    >
      {props.isPending ? <Loader2Icon className="animate-spin" /> : null}
      {t("actions.connect")}
    </Button>
  )
}
