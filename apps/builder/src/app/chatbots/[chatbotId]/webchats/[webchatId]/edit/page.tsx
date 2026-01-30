import { Suspense } from "react"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
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

  return (
    <FlowStoreProvider chatbotId={chatbotId}>
      <Suspense fallback={<div>Loading...</div>}>
        <UpdateWebchatForm integrationWebchat={integrationWebchat} />
      </Suspense>
    </FlowStoreProvider>
  )
}
