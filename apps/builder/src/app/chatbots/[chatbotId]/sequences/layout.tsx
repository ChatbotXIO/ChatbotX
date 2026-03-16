import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function SequencesLayout({
  children,
  params,
}: {
  params: Promise<{ chatbotId: string }>
  children: React.ReactNode
}) {
  const { chatbotId } = await params

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      {children}
    </FlowStoreProvider>
  )
}
