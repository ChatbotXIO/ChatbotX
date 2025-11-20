import AIFunctionsTable from "@/features/ai-functions/ai-functions-table"
import { getAIFunctions } from "@/features/ai-functions/queries"
import { AIHubBreadcrumb } from "@/features/ai-hub/ai-hub-breadcrumb"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"

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
    getAIFunctions({
      chatbotId,
    }),
    getFlows({
      chatbotId,
      ...listFlowsSearchParams.parse({
        perPage: "99999",
      }),
    }),
    listCustomFields({
      chatbotId,
      ...listCustomFieldsSearchParams.parse({
        perPage: "99999",
      }),
    }),
  ])

  return (
    <div className="space-y-6">
      <AIHubBreadcrumb />
      <AIFunctionsTable promises={promises} />
    </div>
  )
}
