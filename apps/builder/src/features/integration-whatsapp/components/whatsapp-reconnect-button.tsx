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
import { buildFacebookOAuthDialogUrl } from "../libs/embedded-signup"
import { parseOAuthRelayResult } from "../libs/oauth-relay"

export function WhatsappReconnectButton({
  integrationWhatsappId,
  settings,
  workspaceId,
  disabled = false,
  oauthCallbackUrl,
}: {
  integrationWhatsappId: string
  settings: WhatsappCredentialPublic | null
  workspaceId: string
  disabled?: boolean
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
        connectExisting: false,
        transferPhoneNumber: false,
        locale: document.documentElement.lang || undefined,
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
