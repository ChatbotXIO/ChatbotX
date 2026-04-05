import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function AutomatedResponsesLayout({
  children,
  params,
}: {
  params: Promise<{ workspaceId: string }>
  children: React.ReactNode
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return (
    <FlowStoreProvider workspaceId={workspaceId}>{children}</FlowStoreProvider>
  )
}
