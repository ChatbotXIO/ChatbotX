import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { getUrls } from "@chatbotx.io/integration-whatsapp/api/url"
import { notFound } from "next/navigation"
import WhatsappEcommerce from "@/features/integration-whatsapp/components/whatsapp-ecommerce"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function WhatsappEcommercePage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const integrationWhatsapp = await findIntegrationWhatsapp({
    workspaceId: data.workspaceId,
    id: data.id,
  })

  const urls = getUrls(integrationWhatsapp.auth as WhatsappAuthValue)

  return <WhatsappEcommerce urls={urls} />
}
