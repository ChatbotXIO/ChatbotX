"use client"

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Loader2Icon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { reconnectWhatsappAction } from "@/features/integration-whatsapp/actions/reconnect.action"
import { buildFacebookOAuthDialogUrl } from "@/features/integration-whatsapp/libs/embedded-signup"
import { parseOAuthRelayResult } from "@/features/integration-whatsapp/libs/oauth-relay"
import { getBrokerOrigin } from "@/lib/oauth-broker"
import {
  getPermissionStatus,
  permissionStatusConfig,
} from "../lib/permission-status"
import { resolveSelectedIntegration } from "../lib/select-account"

export type AdsAccountSwitcherIntegration = {
  id: string
  name: string
  displayPhoneNumber: string
  hasCapiScope: boolean
}

export function WhatsappReconnectButton({
  integrationWhatsappId,
  settings,
  workspaceId,
  disabled = false,
}: {
  integrationWhatsappId: string
  settings: WhatsappCredentialPublic | null
  workspaceId: string
  disabled?: boolean
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
    const brokerOrigin = getBrokerOrigin()
    const handleMessage = (event: MessageEvent) => {
      const result = parseOAuthRelayResult({
        origin: event.origin,
        brokerOrigin,
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
  }, [execute, setIsWaitingForCode, t])

  const openReconnectDialog = () => {
    if (!settings?.clientId) {
      toast.error(t("messages.needToAddSettings"))
      return
    }

    const authTab = window.open(
      buildFacebookOAuthDialogUrl({
        resellerOrigin: window.location.origin,
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

export function AdsAccountSwitcher({
  integrations,
  whatsappCredentialPublic,
  workspaceId,
}: {
  integrations: AdsAccountSwitcherIntegration[]
  whatsappCredentialPublic: WhatsappCredentialPublic | null
  workspaceId: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const selectedIntegration = resolveSelectedIntegration(
    integrations,
    searchParams.get("account") ?? "",
  )
  const selectedStatus = selectedIntegration
    ? getPermissionStatus(selectedIntegration, whatsappCredentialPublic)
    : null
  const options = useMemo(
    () =>
      integrations.map((integration) => ({
        label: `${integration.name} — ${integration.displayPhoneNumber}`,
        value: integration.id,
      })),
    [integrations],
  )

  if (!(selectedIntegration && selectedStatus)) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select
        items={options}
        onValueChange={(value) => {
          const params = new URLSearchParams(searchParams)
          params.set("account", value as string)
          router.replace(`${pathname}?${params.toString()}`, {
            scroll: false,
          })
        }}
        value={selectedIntegration.id}
      >
        <SelectTrigger
          aria-label={t("ads.connectAccounts.selectAccountLabel")}
          className="w-full min-w-72"
          id="ads-account-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {integrations.map((integration) => {
            const itemStatus = getPermissionStatus(
              integration,
              whatsappCredentialPublic,
            )
            const itemConfig = permissionStatusConfig[itemStatus]
            return (
              <SelectItem key={integration.id} value={integration.id}>
                <span className="flex items-center gap-2">
                  <span
                    aria-label={t(itemConfig.labelKey)}
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      itemConfig.dotClassName,
                    )}
                    role="img"
                  />
                  <span className="truncate">
                    {integration.name} — {integration.displayPhoneNumber}
                  </span>
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      {selectedStatus === "missingPermission" && (
        <WhatsappReconnectButton
          integrationWhatsappId={selectedIntegration.id}
          settings={whatsappCredentialPublic}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
