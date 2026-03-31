import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function AutomatedResponsesLayout({
  children,
  params,
}: {
  params: Promise<{ chatbotId: string }>
  children: React.ReactNode
}) {
  const { chatbotId: chatbotIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  return <FlowStoreProvider chatbotId={chatbotId}>{children}</FlowStoreProvider>
}
