import { notFound } from "next/navigation"
import { Suspense } from "react"
import { WhatsappMessageTemplatesTable } from "@/features/integration-whatsapp/message-templates/message-templates-table"
import { getMessageTemplates } from "@/features/integration-whatsapp/message-templates/queries"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function WhatsappMessageTemplatePage(props: {
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

  const promises = getMessageTemplates({
    workspaceId,
    id,
  })

  return (
    <Suspense>
      <WhatsappMessageTemplatesTable
        integrationWhatsapp={integrationWhatsapp}
        promises={promises}
      />
    </Suspense>
  )
}
