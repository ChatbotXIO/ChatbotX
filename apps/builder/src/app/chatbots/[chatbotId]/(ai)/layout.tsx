import type { ReactNode } from "react"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { NoAIIntegrationFound } from "@/features/integrations/components/no-ai-integration-found"
import { hasAIIntegration } from "@/features/integrations/queries/get-ai-integrations"

export default async function AILayout({
  params,
  children,
}: {
  params: Promise<{ chatbotId: string }>
  children: ReactNode
}) {
  const { chatbotId } = await params
  const hasAIIntegrationResult = await hasAIIntegration(chatbotId)
  if (!hasAIIntegrationResult) {
    return <NoAIIntegrationFound chatbotId={chatbotId} />
  }

  return (
    <CustomFieldStoreProvider chatbotId={chatbotId}>
      {children}
    </CustomFieldStoreProvider>
  )
}
