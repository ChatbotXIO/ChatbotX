import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { BotSimulatorForm } from "@/features/bot-simulator/components/bot-simulator-form"
import { listIntegrationWebchats } from "@/features/integration-webchat/queries"
import { maxPerPage } from "@/lib/shared-request"

export default async function BotSimulatorPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const [t, { data: webchats }] = await Promise.all([
    getTranslations(),
    listIntegrationWebchats({ workspaceId, page: 1, perPage: maxPerPage }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("botSimulator.title"), href: "" },
        ]}
      />
      <BotSimulatorForm
        webchats={webchats.map((webchat) => ({
          id: webchat.id,
          name: webchat.name,
          enable: webchat.enable,
          authorizedDomains: webchat.authorizedDomains,
        }))}
        workspaceId={workspaceId}
      />
    </div>
  )
}
