import { integrationWebchatService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { SimulatorWidget } from "@/features/bot-simulator/components/simulator-widget"
import {
  isSimulatorWebsiteAllowed,
  parseSimulatorWebsiteUrl,
} from "@/features/bot-simulator/lib/build-simulator-link"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return {
    title: t("botSimulator.title"),
    robots: { index: false, follow: false },
  }
}

export default async function BotSimulatorPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; webchatId: string }>
  searchParams: Promise<{ url?: string | string[] }>
}) {
  const [resolvedParams, { url }] = await Promise.all([params, searchParams])
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const webchatId = getIdFromParams(resolvedParams, "webchatId")
  const websiteUrl = parseSimulatorWebsiteUrl(url)
  if (!(workspaceId && webchatId && websiteUrl)) {
    return notFound()
  }

  const { servable } = await loadServableWorkspace(workspaceId)
  if (!servable) {
    return notFound()
  }

  const webchat = await integrationWebchatService.findByIdForWorkspaceOrNull({
    id: webchatId,
    workspaceId,
  })
  if (
    !(
      webchat?.enable &&
      isSimulatorWebsiteAllowed(websiteUrl, webchat.authorizedDomains)
    )
  ) {
    return notFound()
  }

  const t = await getTranslations()

  return (
    <main className="fixed inset-0 bg-background">
      {/* Sandboxed without allow-top-navigation so a frame-busting site
          cannot navigate the simulator away from itself. */}
      <iframe
        className="size-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        src={websiteUrl.toString()}
        title={t("botSimulator.websitePreview")}
      />
      <SimulatorWidget
        brandColor={webchat.brandColor}
        webchatId={webchat.id}
        websiteUrl={websiteUrl.toString()}
        workspaceId={workspaceId}
      />
    </main>
  )
}
