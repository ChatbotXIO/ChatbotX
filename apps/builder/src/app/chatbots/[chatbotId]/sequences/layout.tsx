import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function SequencesLayout({
  children,
  params,
}: {
  params: Promise<{ chatbotId: string }>
  children: React.ReactNode
}) {
  const chatbotId = getIdFromParams(await params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      {children}
    </FlowStoreProvider>
  )
}
