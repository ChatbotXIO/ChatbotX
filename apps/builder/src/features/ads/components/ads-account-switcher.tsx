"use client"

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { WhatsappReconnectButton } from "@/features/integration-whatsapp/components/whatsapp-reconnect-button"
import {
  getPermissionStatus,
  permissionStatusConfig,
} from "@/features/integration-whatsapp/libs/permission-status"
import { resolveSelectedIntegration } from "../lib/select-account"

export type AdsAccountSwitcherIntegration = {
  id: string
  name: string
  displayPhoneNumber: string
  hasCapiScope: boolean
}

export function AdsAccountSwitcher({
  integrations,
  whatsappCredentialPublic,
  workspaceId,
  oauthCallbackUrl,
}: {
  integrations: AdsAccountSwitcherIntegration[]
  whatsappCredentialPublic: WhatsappCredentialPublic | null
  workspaceId: string
  oauthCallbackUrl: string
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
          oauthCallbackUrl={oauthCallbackUrl}
          settings={whatsappCredentialPublic}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
