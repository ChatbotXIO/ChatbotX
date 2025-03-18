import { findFlow } from "@/features/flows/queries"
import { ReactFlowFrame } from "@/features/flows/react-flow/frame"
import type { FlowNode } from "@/features/flows/react-flow/stores/flow-store"
import { FlowStoreProvider } from "@/features/flows/react-flow/stores/flow-store-provider"
import type { Edge } from "@xyflow/react"

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

  return (
    <FlowStoreProvider
      nodes={targetFlowVersion.nodes as unknown as FlowNode[]}
      edges={targetFlowVersion.edges as unknown as Edge[]}
    >
      <ReactFlowFrame flowVersion={targetFlowVersion} />
    </FlowStoreProvider>
  )
}
