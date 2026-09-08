"use client"

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { reconnectWhatsappAction } from "../actions/reconnect.action"
import {
  buildFacebookOAuthDialogUrl,
  EMBEDDED_SIGNUP_VERSIONS,
  FACEBOOK_AUTH_TYPES,
} from "../libs/embedded-signup"
import { parseOAuthRelayResult } from "../libs/oauth-relay"

export function WhatsappReconnectButton({
  integrationWhatsappId,
  settings,
  workspaceId,
  disabled = false,
  isCoexist = false,
  oauthCallbackUrl,
}: {
  integrationWhatsappId: string
  settings: WhatsappCredentialPublic | null
  workspaceId: string
  disabled?: boolean
  /**
   * Whether this number lives on the WhatsApp Business app. Meta only offers
   * "connect an existing WhatsApp Business app account" when the dialog asks
   * for that flow, so without this such an account is missing from the list
   * and the operator has nothing to reconnect to.
   */
  isCoexist?: boolean
  /**
   * Absolute callback URL registered with Meta for this credential — the
   * broker callback for inherited/platform credentials, or the reseller's
   * own custom domain callback for a tenant-owned one. Computed server-side
   * (see `lib/provider-origin.ts`).
   */
  oauthCallbackUrl: string
}) {
  const router = useRouter()
  const t = useTranslations()
  const [isWaitingForCode, setIsWaitingForCodeState] = useState(false)
  const isWaitingForCodeRef = useRef(false)
  const setIsWaitingForCode = useCallback((waiting: boolean) => {
    isWaitingForCodeRef.current = waiting
    setIsWaitingForCodeState(waiting)
  }, [])
  const { execute, isPending } = useAction(
    reconnectWhatsappAction.bind(null, workspaceId, integrationWhatsappId),
    {
      onSuccess: () => {
        setIsWaitingForCode(false)
        toast.success(t("ads.connectAccounts.reconnectSuccess"))
        router.refresh()
      },
      onError: ({ error }) => {
        setIsWaitingForCode(false)
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  useEffect(() => {
    const expectedOrigin = new URL(oauthCallbackUrl).origin
    const handleMessage = (event: MessageEvent) => {
      const result = parseOAuthRelayResult({
        origin: event.origin,
        expectedOrigin,
        data: event.data,
      })
      if (result.type === "ignored") {
        return
      }
      if (!isWaitingForCodeRef.current) {
        return
      }

      if (result.type === "success") {
        execute({ code: result.code })
        return
      }

      setIsWaitingForCode(false)
      toast.error(t("messages.connectFailed", { feature: "Whatsapp" }))
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [execute, oauthCallbackUrl, setIsWaitingForCode, t])

  const openReconnectDialog = () => {
    if (!settings?.clientId) {
      toast.error(t("messages.needToAddSettings"))
      return
    }

    const authTab = window.open(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: window.location.origin,
        redirectUri: oauthCallbackUrl,
        clientId: settings.clientId,
        configId: settings.configId,
        version: settings.version,
        // Selects Meta's WhatsApp Business app onboarding screen, which is
        // where a coexistence account appears. A Cloud API number keeps the
        // default WABA selection screen.
        connectExisting: isCoexist,
        transferPhoneNumber: false,
        locale: document.documentElement.lang || undefined,
        // A reconnect exists to pick up a permission the account is missing.
        // Without this the dialog hands back the permissions it already
        // granted and the operator sees no change.
        authType: FACEBOOK_AUTH_TYPES.REREQUEST,
        // Reconnect leads the move to v4, where CTWA and the WhatsApp
        // Conversions API are products of the Login Configuration rather than
        // `extras`. Connect stays on the unpinned default until it follows.
        embeddedSignupVersion: EMBEDDED_SIGNUP_VERSIONS.V4,
      }),
      "_blank",
    )
    if (!authTab) {
      toast.error(t("whatsapp.embeddedSignupPopupBlocked"))
      return
    }
    setIsWaitingForCode(true)
  }

  return (
    <Button
      disabled={disabled || isPending || isWaitingForCode}
      onClick={openReconnectDialog}
      size="sm"
      variant="outline"
    >
      {(isPending || isWaitingForCode) && (
        <Loader2Icon className="animate-spin" />
      )}
      {t("ads.connectAccounts.reconnect")}
    </Button>
  )
}
