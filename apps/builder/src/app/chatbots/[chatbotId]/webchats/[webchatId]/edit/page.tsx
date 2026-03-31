import { notFound } from "next/navigation"
import { Suspense } from "react"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { UpdateWebchatForm } from "@/features/integration-webchat/components/update-webchat-form"
import { findIntegrationWebchat } from "@/features/integration-webchat/queries"

export default async function WebchatEditPage({
  params,
}: {
  params: Promise<{ chatbotId: string; webchatId: string }>
}) {
  const { chatbotId: chatbotIdString, webchatId: webchatIdString } =
    await params
  const chatbotId = BigInt(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }
  const webchatId = BigInt(webchatIdString)
  if (!webchatId) {
    return notFound()
  }

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
