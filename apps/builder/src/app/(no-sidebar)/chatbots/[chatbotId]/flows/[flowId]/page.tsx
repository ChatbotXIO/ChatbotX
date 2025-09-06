import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { FlowDetail } from "@/features/flows/flow-detail"
import { findFlow, getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"

export default async function FlowPage(props: {
  params: Promise<{ chatbotId: string; flowId: string }>
}) {
  const params = await props.params
  const flow = await findFlow({
    id: params.flowId,
    chatbotId: params.chatbotId,
  })

  const targetFlowVersion = flow.data?.flowVersions?.find((v) => v.isDraft)
  if (!targetFlowVersion) {
    return null
  }

  const promises = Promise.all([
    listCustomFields({
      chatbotId: params.chatbotId,
      ...listCustomFieldsSearchParams.parse({}),
    }),
    getFlows({
      chatbotId: params.chatbotId,
      ...listFlowsSearchParams.parse({}),
    }),
  ])

  return <FlowDetail flowVersion={targetFlowVersion} promises={promises} />
}
