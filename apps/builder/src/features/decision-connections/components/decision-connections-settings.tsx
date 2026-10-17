"use client"

import type { DecisionConnectionSafe } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { CheckCircle2Icon, Loader2Icon, XCircleIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { testDecisionConnectionAction } from "@/features/decision-connections/actions/test-decision-connection.action"
import { toggleDecisionConnectionAction } from "@/features/decision-connections/actions/toggle-decision-connection.action"
import { useWorkspaceId } from "@/hooks/routing"
import { DecisionConnectionDialog } from "./connection-dialog"

type DecisionConnectionsSettingsProps = {
  connections: DecisionConnectionSafe[]
}

export function DecisionConnectionsSettings({
  connections,
}: DecisionConnectionsSettingsProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-4">
      <SettingRow
        description={t("decision.connectionsDescription")}
        label={t("decision.connections")}
      >
        <DecisionConnectionDialog />
      </SettingRow>

      {connections.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("decision.empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {connections.map((connection) => (
            <DecisionConnectionRow
              connection={connection}
              key={connection.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DecisionConnectionRow({
  connection,
}: {
  connection: DecisionConnectionSafe
}) {
  const workspaceId = useWorkspaceId()
  const router = useRouter()
  const t = useTranslations()
  const { execute: toggle, isPending: isToggling } = useAction(
    toggleDecisionConnectionAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
      onSuccess: () => router.refresh(),
    },
  )
  const { execute: test, isPending: isTesting } = useAction(
    testDecisionConnectionAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
      onSuccess: ({ data }) => {
        toast[data?.status === "passed" ? "success" : "error"](
          t(
            data?.status === "passed"
              ? "decision.testPassed"
              : "decision.testFailed",
          ),
        )
        router.refresh()
      },
    },
  )
  const providerLabel = t(`decision.providers.${connection.providerKind}`)
  const model = connection.defaultModel ?? connection.modelCatalog[0]
  const testStatus = connection.lastTest.status

  return (
    <SettingRow
      description={`${providerLabel}${model ? ` · ${model}` : ""}`}
      label={connection.name}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Switch
          aria-label={t("fields.enabled.label")}
          checked={connection.status === "enabled"}
          disabled={isToggling}
          onCheckedChange={(enabled) => toggle({ enabled, id: connection.id })}
        />
        <Button
          disabled={isTesting}
          onClick={() => test({ id: connection.id })}
          size="sm"
          type="button"
          variant="outline"
        >
          {isTesting && <Loader2Icon className="animate-spin" />}
          {t("actions.testNow")}
        </Button>
        <DecisionConnectionDialog connection={connection} />
        {testStatus === "passed" && (
          <CheckCircle2Icon
            aria-label={t("decision.testPassed")}
            className="size-4 text-green-600"
          />
        )}
        {testStatus === "failed" && (
          <XCircleIcon
            aria-label={t("decision.testFailed")}
            className="size-4 text-destructive"
          />
        )}
      </div>
    </SettingRow>
  )
}
