import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { AIToolsStoreProvider } from "@/features/ai-tools/provider/ai-tools-store-context"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { NoAIIntegrationFound } from "@/features/integrations/components/no-ai-integration-found"
import { hasAIIntegration } from "@/features/integrations/queries/get-ai-integrations"

export default async function AILayout({
  params,
  children,
}: {
  params: Promise<{ workspaceId: string }>
  children: ReactNode
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const hasAIIntegrationResult = await hasAIIntegration(workspaceId)
  if (!hasAIIntegrationResult) {
    return <NoAIIntegrationFound workspaceId={workspaceId} />
  }

  return (
    <CustomFieldStoreProvider workspaceId={workspaceId}>
      <AIToolsStoreProvider workspaceId={workspaceId}>
        {children}
      </AIToolsStoreProvider>
    </CustomFieldStoreProvider>
  )
}
