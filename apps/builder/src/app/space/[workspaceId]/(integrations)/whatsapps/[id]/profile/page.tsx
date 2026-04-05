import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { UpdateWhatsappProfile } from "@/features/integration-whatsapp/profile/update-whatsapp-profile"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return <UpdateWhatsappProfile workspaceId={workspaceId} />
}
