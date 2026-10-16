"use client"

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { connectWhatsappCapiAction } from "../actions/connect-capi.action"
import { useWhatsappOAuthPopup } from "../hooks/use-whatsapp-oauth-popup"
import {
  buildFacebookOAuthDialogUrl,
  EMBEDDED_SIGNUP_VERSIONS,
  FACEBOOK_AUTH_TYPES,
} from "../libs/embedded-signup"

type WhatsappCapiConnectButtonProps = {
  integrationWhatsappId: string
  workspaceId: string
  settings: WhatsappCredentialPublic | null
  /**
   * Whether this number lives on the WhatsApp Business app. Meta only offers
   * "connect an existing WhatsApp Business app account" when the dialog asks for
   * that flow, so without this such an account would be missing from the list.
   */
  isCoexist?: boolean
  /**
   * Absolute callback URL registered with Meta for this credential — the broker
   * callback for inherited/platform credentials, or the reseller's own custom
   * domain callback for a tenant-owned one. Computed server-side (see
   * `lib/provider-origin.ts`).
   */
  oauthCallbackUrl: string
  disabled?: boolean
}

/**
 * Opens the Embedded Signup configuration dedicated to the Conversions API
 * (`capiConfigId` of the WhatsApp platform credential) and hands the relayed code
 * to `connectWhatsappCapiAction`, which stores a separate token for CAPI events.
 */
export function WhatsappCapiConnectButton({
  integrationWhatsappId,
  workspaceId,
  settings,
  isCoexist = false,
  oauthCallbackUrl,
  disabled = false,
}: WhatsappCapiConnectButtonProps) {
  const router = useRouter()
  const t = useTranslations()
  const { execute, isPending } = useAction(
    connectWhatsappCapiAction.bind(null, workspaceId, integrationWhatsappId),
    {
      onSuccess: () => {
        stopWaiting()
        toast.success(t("metaConversions.connect.success"))
        router.refresh()
      },
      onError: ({ error }) => {
        stopWaiting()
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  const { isWaiting, openPopup, stopWaiting } = useWhatsappOAuthPopup({
    oauthCallbackUrl,
    onCode: (code) => execute({ code }),
    onRelayError: () =>
      toast.error(t("messages.connectFailed", { feature: "Whatsapp" })),
  })

  const openConnectDialog = () => {
    if (!settings?.clientId) {
      toast.error(t("messages.needToAddSettings"))
      return
    }
    if (!settings.capiConfigId) {
      toast.error(t("metaConversions.errors.capiNotConfigured"))
      return
    }

    const opened = openPopup(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: window.location.origin,
        redirectUri: oauthCallbackUrl,
        clientId: settings.clientId,
        configId: settings.capiConfigId,
        version: settings.version,
        connectExisting: isCoexist,
        transferPhoneNumber: false,
        locale: document.documentElement.lang || undefined,
        // Re-ask a permission the admin declined last time, otherwise the dialog
        // hands back the grant it already has and nothing changes.
        authType: FACEBOOK_AUTH_TYPES.REREQUEST,
        embeddedSignupVersion: EMBEDDED_SIGNUP_VERSIONS.V4,
      }),
    )
    if (!opened) {
      toast.error(t("whatsapp.embeddedSignupPopupBlocked"))
    }
  }

  const isBusy = isPending || isWaiting
  return (
    <Button
      disabled={disabled || isBusy}
      onClick={openConnectDialog}
      type="button"
    >
      {isBusy && <Loader2Icon className="animate-spin" />}
      {t("metaConversions.connect.button")}
    </Button>
  )
}
