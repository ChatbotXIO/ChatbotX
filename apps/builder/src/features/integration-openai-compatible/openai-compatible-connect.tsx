"use client"

import { openaiCompatiblePresetConfigs } from "@chatbotx.io/ai"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import { useWorkspaceId } from "@/hooks/routing"
import { updateOpenaiCompatibleEnabledAction } from "./actions/update.action"
import { OpenaiCompatibleConnectDialog } from "./openai-compatible-connect-dialog"
import { OpenaiCompatibleDisconnectDialog } from "./openai-compatible-disconnect-dialog"
import { OpenaiCompatibleEditDialog } from "./openai-compatible-edit-dialog"
import type { listIntegrationOpenaiCompatible } from "./queries"

type OpenaiCompatibleConnectProps = {
  promises: Promise<
    [Awaited<ReturnType<typeof listIntegrationOpenaiCompatible>>]
  >
}

export function OpenaiCompatibleConnect({
  promises,
}: OpenaiCompatibleConnectProps) {
  const [integrations] = use(promises)
  const t = useTranslations()
  const sortedIntegrations = integrations
    .map((integration, index) => ({ integration, index }))
    .sort((left, right) => {
      const leftSortGroup = left.integration.preset === "custom" ? 1 : 0
      const rightSortGroup = right.integration.preset === "custom" ? 1 : 0

      return leftSortGroup - rightSortGroup || left.index - right.index
    })
    .map(({ integration }) => integration)
  const connectedPresets = integrations.map((integration) => integration.preset)

  return (
    <div className="flex flex-col gap-4">
      <SettingRow
        description={t("openaiCompatible.connect.description")}
        label={t("openaiCompatible.connect.label")}
      >
        <OpenaiCompatibleConnectDialog connectedPresets={connectedPresets} />
      </SettingRow>

      <div className="flex flex-col gap-3">
        {integrations.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            {t("openaiCompatible.empty")}
          </div>
        ) : (
          sortedIntegrations.map((integration) => (
            <OpenaiCompatibleProviderRow
              connectedPresets={connectedPresets}
              integration={integration}
              key={integration.id}
            />
          ))
        )}
      </div>
    </div>
  )
}

function OpenaiCompatibleProviderRow({
  connectedPresets,
  integration,
}: {
  connectedPresets: string[]
  integration: Awaited<
    ReturnType<typeof listIntegrationOpenaiCompatible>
  >[number]
}) {
  const workspaceId = useWorkspaceId()
  const router = useRouter()
  const t = useTranslations()

  const { execute, isPending } = useAction(
    updateOpenaiCompatibleEnabledAction.bind(null, workspaceId, integration.id),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  const presetConfig =
    openaiCompatiblePresetConfigs[
      integration.preset as keyof typeof openaiCompatiblePresetConfigs
    ]

  return (
    <SettingRow
      description={`${presetConfig?.label ?? integration.preset} | ${integration.baseURL}`}
      label={integration.name}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span>{t("openaiCompatible.fields.enabled")}</span>
          <Switch
            aria-label={t("openaiCompatible.fields.enabled")}
            checked={integration.enabled}
            disabled={isPending}
            onCheckedChange={(enabled) => execute({ enabled })}
          />
        </div>
        <div className="flex size-4 shrink-0 items-center justify-center">
          {isPending && <Loader2Icon className="size-4 animate-spin" />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <OpenaiCompatibleEditDialog
            connectedPresets={connectedPresets}
            integration={integration}
          />
          <OpenaiCompatibleDisconnectDialog
            integrationId={integration.id}
            title={integration.name}
          />
        </div>
      </div>
    </SettingRow>
  )
}
