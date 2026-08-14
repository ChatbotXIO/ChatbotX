import { notFound } from "next/navigation"
import { Suspense } from "react"
import { WhatsappMessageTemplatesTable } from "@/features/integration-whatsapp/message-templates/message-templates-table"
import { whatsappMessageTemplateService } from "@/features/integration-whatsapp/message-templates/queries"
import {
  findIntegrationWhatsapp,
  toIntegrationWhatsappLinkable,
} from "@/features/integration-whatsapp/queries"
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

  const promises = whatsappMessageTemplateService.list({
    where: {
      workspaceId,
      integrationWhatsappId: id,
    },
  })

  return (
    <Suspense>
      <WhatsappMessageTemplatesTable
        integrationWhatsapp={toIntegrationWhatsappLinkable(integrationWhatsapp)}
        promises={promises}
      />
    </Suspense>
  )
}
