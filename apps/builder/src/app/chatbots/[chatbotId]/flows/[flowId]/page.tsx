import { findFlow } from "@/features/flows/queries"
import { ReactFlowFrame } from "@/features/flows/react-flow/frame"

export default async function FlowPage(props: {
  params: Promise<{ chatbotId: string; flowId: string }>
}) {
  const params = await props.params
  const promise = findFlow({
    id: params.flowId,
    chatbotId: params.chatbotId,
  })

  return <ReactFlowFrame promises={promise} />
}
