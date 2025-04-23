import { FlowDetail } from "@/features/flows/flow-detail"
import { findFlow } from "@/features/flows/queries"

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

  return <FlowDetail flowVersion={targetFlowVersion} />
}
