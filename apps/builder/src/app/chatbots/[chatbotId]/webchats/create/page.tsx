import { Suspense } from "react"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { CreateWebchatForm } from "@/features/webchat/components/create-webchat-form"

export default async function CreateWebchatPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FlowStoreProvider chatbotId={chatbotId}>
        <CreateWebchatForm />
      </FlowStoreProvider>
    </Suspense>
  )
}
