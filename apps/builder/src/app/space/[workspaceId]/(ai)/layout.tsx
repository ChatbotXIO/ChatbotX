import type { ReactNode } from "react"
import { AIToolsStoreProvider } from "@/features/ai-tools/provider/ai-tools-store-context"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { NoAIIntegrationFound } from "@/features/integrations/components/no-ai-integration-found"
import { hasAIIntegration } from "@/features/integrations/queries/get-ai-integrations"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function AILayout({
  params,
  children,
}: {
  params: Promise<{ workspaceId: string }>
  children: ReactNode
}) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "flows")

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
