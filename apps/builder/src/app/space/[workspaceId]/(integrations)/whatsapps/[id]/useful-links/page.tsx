import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { getUrls } from "@chatbotx.io/integration-whatsapp/api/url"
import { notFound } from "next/navigation"
import WhatsappUsefulLinks from "@/features/integration-whatsapp/components/whatsapp-useful-links"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function WhatsappMessageTemplatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const integrationWhatsapp = await findIntegrationWhatsapp({ workspaceId, id })

  const urls = getUrls(integrationWhatsapp.auth as WhatsappAuthValue)

  return <WhatsappUsefulLinks urls={urls} />
}
