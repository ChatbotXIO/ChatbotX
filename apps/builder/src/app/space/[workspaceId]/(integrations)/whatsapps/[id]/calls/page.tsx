import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  getCallingSettings,
  type WhatsappCallingSettings,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { notFound } from "next/navigation"
import { WhatsappCallsCard } from "@/features/integration-whatsapp/calling/whatsapp-calls-card"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function WhatsappCallsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const integrationWhatsapp = await findIntegrationWhatsapp({
    workspaceId: data.workspaceId,
    id: data.id,
  })

  let settings: WhatsappCallingSettings | null = null
  let loadError: string | undefined
  try {
    settings = await getCallingSettings(
      integrationWhatsapp.auth as WhatsappAuthValue,
    )
  } catch (err) {
    loadError = err instanceof Error ? err.message : "unknown"
  }

  return (
    <WhatsappCallsCard
      integrationWhatsappId={data.id}
      loadError={loadError}
      settings={settings}
      workspaceId={data.workspaceId}
    />
  )
}
