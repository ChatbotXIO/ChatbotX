import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function AutomatedResponsesLayout({
  children,
  params,
}: {
  params: Promise<{ chatbotId: string }>
  children: React.ReactNode
}) {
  const { chatbotId } = await params

  return <FlowStoreProvider chatbotId={chatbotId}>{children}</FlowStoreProvider>
}
