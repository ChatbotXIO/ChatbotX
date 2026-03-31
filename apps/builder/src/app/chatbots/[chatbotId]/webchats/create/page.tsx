import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { CreateWebchatForm } from "@/features/integration-webchat/components/create-webchat-form"

export default async function CreateWebchatPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId: chatbotIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FlowStoreProvider chatbotId={chatbotId}>
        <CreateWebchatForm chatbotId={chatbotId} />
      </FlowStoreProvider>
    </Suspense>
  )
}
