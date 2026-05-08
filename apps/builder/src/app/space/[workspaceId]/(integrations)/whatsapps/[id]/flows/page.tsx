import { notFound } from "next/navigation"
import { Suspense } from "react"
import { WhatsappFlowsTable } from "@/features/integration-whatsapp/flows/flows-table"
import { whatsappFlowService } from "@/features/integration-whatsapp/flows/queries"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function WhatsappFlowsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(
    await props.params,
  )
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const integrationWhatsapp = await findIntegrationWhatsapp({ workspaceId, id })

  const promises = whatsappFlowService.list({
    where: {
      workspaceId,
      integrationWhatsappId: id,
    },
  })

  return (
    <Suspense>
      <WhatsappFlowsTable
        integrationWhatsapp={integrationWhatsapp}
        promises={promises}
      />
    </Suspense>
  )
}
