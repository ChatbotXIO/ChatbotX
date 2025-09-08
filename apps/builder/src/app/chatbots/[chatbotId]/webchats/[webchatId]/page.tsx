import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"
import { UpdateWebchatForm } from "@/features/webchat/components/update-webchat-form"
import { findIntegrationWebchat } from "@/features/webchat/queries/get-webchats.query"

type UpdateWebchatPageProps = {
  params: Promise<{ chatbotId: string; webchatId: string }>
}

export default async function UpdateWebchatPage({
  params,
}: UpdateWebchatPageProps) {
  const { chatbotId, webchatId } = await params
  const integrationWebchat = await findIntegrationWebchat({
    id: webchatId,
    chatbotId,
  })

  const promises = Promise.all([
    getFlows({
      chatbotId,
      ...listFlowsSearchParams.parse({}),
    }),
  ])

  return (
    <UpdateWebchatForm
      integrationWebchat={integrationWebchat}
      promises={promises}
    />
  )
}
