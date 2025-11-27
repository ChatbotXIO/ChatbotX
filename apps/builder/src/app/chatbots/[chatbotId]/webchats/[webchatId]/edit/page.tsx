import { Suspense } from "react"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"
import { UpdateWebchatForm } from "@/features/webchat/components/update-webchat-form"
import { findIntegrationWebchat } from "@/features/webchat/queries/get-webchats.query"

export default async function WebchatEditPage({
  params,
}: {
  params: Promise<{ chatbotId: string; webchatId: string }>
}) {
  const { chatbotId, webchatId } = await params

  const integrationWebchat = await findIntegrationWebchat({
    id: webchatId,
    chatbotId,
  })

  const promises = Promise.all([
    getFlows({
      chatbotId,
      ...listFlowsSearchParams.parse({
        active: "1",
        perPage: "1000",
      }),
    }),
  ])
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UpdateWebchatForm
        integrationWebchat={integrationWebchat}
        promises={promises}
      />
    </Suspense>
  )
}
