import { Suspense } from "react"
import AIFunctionsTable from "@/features/ai-functions/ai-functions-table"
import { listAIFunctions } from "@/features/ai-functions/queries"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

type AIFunctionsPageProps = {
  params: Promise<{
    chatbotId: string
  }>
}

export default async function AIFunctionsPage({
  params,
}: AIFunctionsPageProps) {
  const { chatbotId } = await params

  const promises = Promise.all([
    listAIFunctions({
      chatbotId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AITab />

      <Suspense>
        <FlowStoreProvider chatbotId={chatbotId}>
          <CustomFieldStoreProvider chatbotId={chatbotId}>
            <AIFunctionsTable promises={promises} />
          </CustomFieldStoreProvider>
        </FlowStoreProvider>
      </Suspense>
    </div>
  )
}
