import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { AIAgentStoreProvider } from "@/features/ai-agents/provider/ai-agent-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function FbCommentsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return (
    <FlowStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <AIAgentStoreProvider autoInitialize={true} workspaceId={workspaceId}>
        {children}
      </AIAgentStoreProvider>
    </FlowStoreProvider>
  )
}
